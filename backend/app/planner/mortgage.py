"""Mortgage tracks and their amortization tables (Israeli conventions).

A mortgage is a mix of **tracks**. A track of amount :math:`L` and term :math:`n` months has an
interest type and a repayment type. Month :math:`k = 1..n` runs from date :math:`d_{k-1}` to
:math:`d_k` (one month after the start, and so on).

**The yearly rate** :math:`R_k` of month :math:`k` is the one known at its start; the monthly rate
is :math:`r_k = R_k / 12` (a nominal yearly rate, as banks quote it). With :math:`a_k` the anchor
(the Bank of Israel rate) at :math:`d_k`:

* ``fixed``: :math:`R_k = \\rho`;
* ``prime``: :math:`R_k = a_{k-1} + 1.5\\% + \\rho` (:math:`\\rho` is the spread, often negative);
* ``variable``: :math:`R_k = \\rho + a_{p(k)} - a_0`, where :math:`p(k)` is the start of month
  :math:`k`'s period (the rate is reset every ``reset_months`` by the anchor's move since the
  start).

A rate never falls below zero (a reset or a spread that would take it there stops at 0).

**CPI linkage** (``linked``): at the start of month :math:`k` the balance is multiplied by
:math:`I_k / I_{k-1}` (the index at the payment date over the one a month before); the rise is
the month's *linkage*. Simplification: the index of the payment month, not the "known index" of
about six weeks earlier.

**Each month**, on the balance :math:`B` after linkage, with :math:`m = n - k + 1` payments left:

* interest :math:`= B\\,r_k`;
* ``spitzer``: the payment is the annuity :math:`B\\,r_k / (1 - (1 + r_k)^{-m})`
  (:math:`B/m` at a zero rate), recomputed every month, so a rate reset or the linkage moves it;
  with a constant rate and no linkage it is the textbook constant payment;
* ``equal_principal``: principal :math:`B/m` plus the interest;
* ``grace``: for the first ``grace_months`` months only the interest is paid (partial grace) or
  nothing, the interest joining the balance (``grace_full``); then Spitzer over the months left;
* ``balloon``: a grace of :math:`n - 1` months, so everything is repaid in the last payment.

Principal :math:`=` payment :math:`-` interest; :math:`B \\leftarrow B -` principal.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

import numpy as np

from app.models.bars import FloatArray
from app.planner.market import PlanError

PRIME_MARGIN = 0.015


class RateKind(StrEnum):
    FIXED = "fixed"
    PRIME = "prime"
    VARIABLE = "variable"


class Repayment(StrEnum):
    SPITZER = "spitzer"
    EQUAL_PRINCIPAL = "equal_principal"
    GRACE = "grace"
    BALLOON = "balloon"


@dataclass(frozen=True, slots=True)
class Track:
    amount: float
    months: int
    kind: RateKind = RateKind.FIXED
    #: Yearly: the rate (fixed), the first period's rate (variable), the spread over prime.
    rate: float = 0.04
    linked: bool = False
    reset_months: int = 60
    repayment: Repayment = Repayment.SPITZER
    grace_months: int = 0
    grace_full: bool = False


@dataclass(frozen=True, slots=True)
class Schedule:
    """One row per month (index 0 is the first payment); ``balance`` is after the payment."""

    payment: FloatArray
    interest: FloatArray
    principal: FloatArray
    linkage: FloatArray
    balance: FloatArray
    rate: FloatArray

    def outstanding(self, months: int, amount: float) -> float:
        """The balance after ``months`` payments (the loan itself before the first)."""
        if months <= 0:
            return amount
        return float(self.balance[months - 1]) if months <= len(self.balance) else 0.0


def track_rates(track: Track, anchor: FloatArray) -> FloatArray:
    """The yearly rate of each month; ``anchor[k]`` is the anchor rate at :math:`d_k`."""
    n = track.months
    if track.kind is RateKind.FIXED:
        rates = np.full(n, track.rate)
    elif track.kind is RateKind.PRIME:
        rates = anchor[:n] + PRIME_MARGIN + track.rate
    else:
        period_start = (np.arange(n) // track.reset_months) * track.reset_months
        rates = track.rate + anchor[period_start] - anchor[0]
    return np.maximum(rates, 0.0)


def annuity(balance: float, rate: float, months: int) -> float:
    """The level payment that repays ``balance`` in ``months`` at the monthly ``rate``."""
    if rate == 0.0:
        return balance / months
    # 1 - (1 + r)^-m through expm1 and log1p: exact for very small rates too.
    return balance * rate / -math.expm1(-months * math.log1p(rate))


def amortize(track: Track, anchor: FloatArray, index: FloatArray) -> Schedule:
    """The track's table. ``anchor`` and ``index`` (the CPI) hold one value per date
    :math:`d_0 .. d_n` at least."""
    n = track.months
    if n < 1 or track.amount < 0:
        raise PlanError("A track needs a positive term and a non-negative amount")
    if track.repayment is Repayment.GRACE and not 0 <= track.grace_months < n:
        raise PlanError("The grace period must be shorter than the term")
    rates = track_rates(track, anchor)
    grace = {Repayment.GRACE: track.grace_months, Repayment.BALLOON: n - 1}.get(track.repayment, 0)
    out = np.zeros((5, n))
    balance = track.amount
    for k in range(1, n + 1):
        linkage = balance * (index[k] / index[k - 1] - 1.0) if track.linked else 0.0
        balance += linkage
        r = rates[k - 1] / 12.0
        interest = balance * r
        left = n - k + 1
        if k <= grace:
            payment = 0.0 if track.grace_full else interest
        elif track.repayment is Repayment.EQUAL_PRINCIPAL:
            payment = balance / left + interest
        else:
            payment = annuity(balance, r, left)
        principal = payment - interest
        balance -= principal
        out[:, k - 1] = (payment, interest, principal, linkage, balance)
    out[4, -1] = 0.0  # the last payment clears the loan (drops the rounding residue)
    return Schedule(*out, rate=rates)


def combine(schedules: Sequence[Schedule], months: int) -> Schedule:
    """The tracks' tables added up over ``months`` months (a finished track adds zeros). The
    rate column is the balance-weighted yearly rate."""
    columns = np.zeros((5, months))
    weighted = np.zeros(months)
    for s in schedules:
        n = min(len(s.payment), months)
        columns[:, :n] += (
            s.payment[:n],
            s.interest[:n],
            s.principal[:n],
            s.linkage[:n],
            s.balance[:n],
        )
        before = s.balance[:n] + s.principal[:n]  # the balance the month's interest ran on
        weighted[:n] += before * s.rate[:n]
    before_all = columns[4] + columns[2]
    rate = np.divide(weighted, before_all, out=np.zeros(months), where=before_all > 0)
    return Schedule(*columns, rate=rate)
