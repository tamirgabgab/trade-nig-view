"""Layer 3 of the comparison metrics: what the answer depends on
(``docs/HOME_VS_MARKET_PLAN.md``).

**The apartment's return by source.** Four sources can each be switched off:

* *appreciation*: the value stays at the price (and so does a rent that follows the value);
* *rent*: none is saved or received;
* *leverage*: the apartment is bought in cash, without a mortgage;
* *costs*: no purchase tax, lawyer, broker or renovation; no maintenance or insurance; no
  selling cost, early-repayment fee or betterment tax; no vacancy or rent tax.

With all four off the apartment is bought and sold for the same price and earns nothing. Let
:math:`v(S)` be its yearly return (XIRR) with the sources :math:`S` on. Switching one source
off at a time does not add up to :math:`v(\\text{all})`: leverage multiplies whatever the others
earn. The **Shapley value** shares the return so that it does add up: a source's contribution is
what it adds when it is switched on, averaged over every order in which the four can be switched
on,

.. math::
    \\varphi_i = \\sum_{S \\not\\ni i} \\frac{|S|!\\,(n - |S| - 1)!}{n!}\\,
        \\big(v(S \\cup i) - v(S)\\big),
    \\qquad \\sum_i \\varphi_i = v(\\text{all}) - v(\\varnothing) = v(\\text{all})

An apartment that ends with nothing or a debt has no rate: it counts as -100 %, as in the
comparison. One bought with no money down has no rate either, and nothing to share: there is no
decomposition then.

**A forced sale** sells the apartment at a discount :math:`\\delta` on its value. The betterment
tax is recomputed on the lower price, so the loss is the discount less the tax it saves:

.. math::
    \\text{net worth} = V(1-\\delta)(1 - s) - B(1 + e) - \\text{betterment tax}

**Who leads.** Over exit months :math:`t_1 < \\dots < t_n` with end values :math:`X, Y`: the
share of exits X ends ahead (a tie counts as half), and the first exit after which the option
that leads at the end stays ahead until it. A tie at the last exit has no leader.

**Do the two move together.** The correlation of the yearly returns of two series (yearly,
because a dwelling index is a smoothed monthly series whose monthly moves say little), with
Fisher's interval :math:`\\tanh(\\operatorname{atanh} r \\pm 1.96/\\sqrt{n - 3})`. Fewer than four
whole years, or a series that does not move, have none.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from itertools import combinations
from math import factorial
from typing import Literal

import numpy as np

from app.models.bars import FloatArray
from app.planner.home import HomePlan, HomeResult, HomeSeries, RentMode, betterment_tax, run_home

COMPONENTS = ("appreciation", "rent", "leverage", "costs")
#: Fisher's interval needs n - 3 > 0.
MIN_YEARS = 4
Z95 = 1.959963984540054
#: A yearly return whose standard deviation is below this does not move.
STILL = 1e-9


def shapley(worth: Callable[[frozenset[str]], float], players: Sequence[str]) -> dict[str, float]:
    """Each player's Shapley value in the game ``worth`` (see the module docstring)."""
    n = len(players)
    known: dict[frozenset[str], float] = {}

    def value(on: frozenset[str]) -> float:
        if on not in known:
            known[on] = worth(on)
        return known[on]

    shares: dict[str, float] = {}
    for player in players:
        others = [p for p in players if p != player]
        total = 0.0
        for size in range(n):
            weight = factorial(size) * factorial(n - size - 1) / factorial(n)
            for chosen in combinations(others, size):
                before = frozenset(chosen)
                total += weight * (value(before | {player}) - value(before))
        shares[player] = total
    return shares


def without(plan: HomePlan, series: HomeSeries, off: frozenset[str]) -> tuple[HomePlan, HomeSeries]:
    """The apartment with the sources ``off`` switched off."""
    if "leverage" in off:
        plan = replace(plan, equity=plan.price, tracks=[])
    if "rent" in off:
        plan = replace(plan, rent_mode=RentMode.NONE)
    if "costs" in off:
        plan = replace(
            plan,
            purchase_tax=(),
            lawyer=0.0,
            broker=0.0,
            renovation=0.0,
            maintenance=0.0,
            insurance=0.0,
            vacancy=0.0,
            rent_tax=0.0,
            selling=0.0,
            early_repayment=0.0,
            betterment=replace(plan.betterment, rate=0.0, brackets=()),
        )
    if "appreciation" in off:
        # A rent that follows the value is part of the appreciation: it stays flat with it.
        held = len(series.rent)
        follows = held <= len(series.value) and np.array_equal(series.rent, series.value[:held])
        series = replace(
            series,
            value=np.ones_like(series.value),
            rent=np.ones(held) if follows else series.rent,
        )
    return plan, series


def home_return(plan: HomePlan, series: HomeSeries) -> float | None:
    """The apartment's yearly return; -100 % when money went in and none came back. None when
    there is no such rate: no money was put in, or the rate is beyond what XIRR searches."""
    result = run_home(plan, series)
    if result.xirr is not None:
        return result.xirr
    flows = result.rent - result.payment - result.costs
    flows[0] = -(plan.equity + result.purchase_costs)
    flows[-1] += result.net_worth[-1]
    return -1.0 if np.any(flows < 0) and not np.any(flows > 0) else None


def decompose(plan: HomePlan, series: HomeSeries) -> dict[str, float] | None:
    """The apartment's yearly return (``total``) and each source's contribution to it. None
    when the return, or that of the apartment with some sources off, does not exist (an
    apartment bought with no money down has no rate of return to share out)."""
    everything = frozenset(COMPONENTS)
    worth: dict[frozenset[str], float] = {frozenset(): 0.0}  # all off: bought and sold at par
    for size in range(1, len(COMPONENTS) + 1):
        for chosen in combinations(COMPONENTS, size):
            on = frozenset(chosen)
            rate = home_return(*without(plan, series, everything - on))
            if rate is None:
                return None
            worth[on] = rate
    return {**shapley(worth.__getitem__, COMPONENTS), "total": worth[everything]}


def forced_sale(plan: HomePlan, series: HomeSeries, result: HomeResult, discount: float) -> float:
    """The net worth at the sale when the apartment sells ``discount`` below its value."""
    months = plan.months
    value = float(result.value[-1]) * (1.0 - discount)
    net_sale = value * (1.0 - plan.selling)
    tax = betterment_tax(
        plan.betterment,
        value=value,
        net_sale=net_sale,
        indexed_cost=(plan.price + result.purchase_costs)
        * float(series.cpi[months] / series.cpi[0]),
        bought=plan.start,
        sold=result.dates[-1],
    )
    return net_sale - float(result.balance[-1]) * (1.0 + plan.early_repayment) - tax


@dataclass(frozen=True, slots=True)
class Lead:
    #: The option ahead at the last exit (None: a tie), and the exit month it leads from.
    leader: Literal["x", "y"] | None
    since: int | None
    #: The share of exit months x ends ahead (a tie counts as half).
    x_share: float


def lead(months: Sequence[int], x: FloatArray, y: FloatArray) -> Lead:
    """Who leads over the exit ``months``, and from which of them to the end."""
    ahead = np.sign(x - y)
    share = float(np.mean((ahead + 1.0) / 2.0))
    if ahead[-1] == 0:
        return Lead(None, None, share)
    changed = np.flatnonzero(ahead != ahead[-1])
    first = 0 if len(changed) == 0 else int(changed[-1]) + 1
    return Lead("x" if ahead[-1] > 0 else "y", int(months[first]), share)


@dataclass(frozen=True, slots=True)
class Correlation:
    value: float
    years: int
    low: float
    high: float


def yearly_correlation(a: FloatArray, b: FloatArray) -> Correlation | None:
    """The correlation of the yearly returns of two series given as monthly growths (the same
    months for both; the months after the last whole year are left out)."""
    years = min(len(a), len(b)) // 12
    if years < MIN_YEARS:
        return None
    ra = np.prod(a[: 12 * years].reshape(years, 12), axis=1)
    rb = np.prod(b[: 12 * years].reshape(years, 12), axis=1)
    if min(float(np.std(ra)), float(np.std(rb))) < STILL:
        return None
    r = float(np.clip(np.corrcoef(ra, rb)[0, 1], -1.0, 1.0))
    if abs(r) >= 1.0 - STILL:
        return Correlation(r, years, r, r)
    z, half = np.arctanh(r), Z95 / np.sqrt(years - 3)
    return Correlation(r, years, float(np.tanh(z - half)), float(np.tanh(z + half)))
