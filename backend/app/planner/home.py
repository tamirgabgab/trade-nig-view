"""The apartment: bought with equity and a mortgage, held, and sold; its net worth on the way.

Months :math:`k = 0..T` run from the purchase (date :math:`d_0`) to the sale (:math:`d_T`).

**The purchase.** Price :math:`P`, equity :math:`E`, loan :math:`P - E` split into tracks
(``app.planner.mortgage``). Purchase costs: the purchase tax (a bracket table on the price), the
lawyer and the broker (fractions of the price) and a renovation.

**A bracket table** taxes each slice of an amount at its own rate:
:math:`\\sum_j \\rho_j \\cdot |[\\ell_j, u_j) \\cap [0, A]|`.

**Each month** :math:`k \\ge 1`:

* the mortgage payment of the month (zero after a track ends);
* owner costs: maintenance, a yearly fraction of the value, :math:`m V_k / 12`, and insurance, a
  yearly amount that follows the CPI;
* rent, :math:`\\text{rent}_0 \\cdot X_{k-1} / X_0` for a rent index :math:`X` (the CPI, the
  apartment's value, or a fixed yearly rise): **saved** when the owner lives in the apartment, or
  **received** when it is rented out, then less the vacancy share and the rent tax.

**The value** follows an index: :math:`V_k = P \\cdot J_k / J_0` (the dwelling price index, or an
assumed path: lognormal monthly steps whose yearly mean growth is :math:`\\mu` and whose yearly
log-volatility is :math:`\\sigma`).

**A sale in month** :math:`k`: selling costs :math:`s V_k`; the loan's balance :math:`B_k` is
repaid, plus an early-repayment fee :math:`e B_k`; and the betterment tax. So

.. math::
    \\text{net worth}_k = V_k (1 - s) - B_k (1 + e) - \\text{betterment tax}_k

**Betterment tax** is charged on the real gain
:math:`G = V_k (1 - s) - C \\cdot I_k / I_0`, with :math:`C` the price plus the purchase costs (or,
for an apartment owned before the plan, its own cost in shekels of the first day) and :math:`I`
the CPI. By the law's parameters: a rate (25 %) on the taxable part of :math:`G`; a
single home is exempt up to a ceiling, so only the share :math:`\\max(V_k - \\text{ceiling}, 0) /
V_k` is taxable; and for a home bought before 2014 and sold after it, only the share of the
holding days after 2014-01-01 is taxable (the linear rule). Or a custom bracket table on
:math:`G`.

**The return** is the XIRR of the owner's cash flows: :math:`-(E + \\text{purchase costs})` at
:math:`d_0`; each month the rent (saved or received) minus the payment and the owner costs; and
the net worth at :math:`d_T`. A saved rent counts as money received: it is what the owner would
otherwise pay.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

import numpy as np

from app.models.bars import FloatArray
from app.planner.deposits import add_months, day_number
from app.planner.market import PlanError
from app.planner.mortgage import Schedule, Track, amortize, combine
from app.planner.xirr import xirr

LINEAR_FROM = date(2014, 1, 1)


@dataclass(frozen=True, slots=True)
class Bracket:
    #: The slice's upper bound (None: no bound).
    up_to: float | None
    rate: float


def bracket_tax(amount: float, brackets: Sequence[Bracket]) -> float:
    """The tax of ``amount`` by a bracket table (slices in rising order)."""
    tax, lower = 0.0, 0.0
    for bracket in brackets:
        upper = float("inf") if bracket.up_to is None else bracket.up_to
        if amount > lower:
            tax += (min(amount, upper) - lower) * bracket.rate
        lower = upper
    return tax


@dataclass(frozen=True, slots=True)
class Betterment:
    rate: float = 0.25
    #: A single home: exempt up to ``ceiling``.
    single_home: bool = False
    ceiling: float = 5_008_000.0
    #: The linear rule for a home bought before 2014.
    linear: bool = True
    #: A custom table on the real gain, instead of the parameters above.
    brackets: tuple[Bracket, ...] = ()


def betterment_tax(
    spec: Betterment,
    *,
    value: float,
    net_sale: float,
    indexed_cost: float,
    bought: date,
    sold: date,
) -> float:
    """The tax on the real gain ``net_sale - indexed_cost`` (see the module docstring)."""
    gain = net_sale - indexed_cost
    if gain <= 0:
        return 0.0
    if spec.brackets:
        return bracket_tax(gain, spec.brackets)
    taxable = gain
    if spec.single_home:
        taxable *= max(value - spec.ceiling, 0.0) / value
    if spec.linear and bought < LINEAR_FROM <= sold:
        taxable *= (sold - LINEAR_FROM).days / (sold - bought).days
    return spec.rate * taxable


class RentMode(StrEnum):
    NONE = "none"
    LIVE = "live"
    RENT_OUT = "rent_out"


@dataclass(frozen=True, slots=True)
class HomePlan:
    start: date
    #: Months held, until the sale.
    months: int
    price: float
    equity: float
    tracks: Sequence[Track]
    purchase_tax: Sequence[Bracket] = ()
    lawyer: float = 0.0
    broker: float = 0.0
    renovation: float = 0.0
    maintenance: float = 0.0
    insurance: float = 0.0
    rent_mode: RentMode = RentMode.NONE
    rent: float = 0.0
    vacancy: float = 0.0
    rent_tax: float = 0.0
    selling: float = 0.0
    early_repayment: float = 0.0
    betterment: Betterment = field(default_factory=Betterment)
    #: An apartment owned before the plan: what it cost, in shekels of the first day, and the day it
    #: was bought (for the linear rule). None: the price and the purchase costs, on the first day.
    cost: float | None = None
    bought: date | None = None


@dataclass(frozen=True, slots=True)
class HomeSeries:
    """One value per month date :math:`d_0, d_1, \\dots`: ``value`` and ``rent`` up to the sale at
    least, ``cpi`` and ``anchor`` up to the end of the longest track too."""

    value: FloatArray
    cpi: FloatArray
    anchor: FloatArray
    rent: FloatArray


@dataclass(frozen=True, slots=True)
class HomeResult:
    loan: float
    purchase_tax: float
    purchase_costs: float
    #: Each track's whole table, and their sum over the longest term.
    schedules: list[Schedule]
    mortgage: Schedule
    #: Per month 0..T (the flows are zero in month 0).
    dates: list[date]
    value: FloatArray
    balance: FloatArray
    payment: FloatArray
    costs: FloatArray
    rent: FloatArray
    betterment: FloatArray
    net_worth: FloatArray
    xirr: float | None
    xirr_real: float | None
    net_worth_real: float


def assumed_values(
    months: int, mu: float, sigma: float = 0.0, rng: np.random.Generator | None = None
) -> FloatArray:
    """A value index over months 0..``months``: yearly mean growth ``mu``; with ``rng``, lognormal
    monthly steps of yearly log-volatility ``sigma`` (the mean path without)."""
    drift = np.log1p(mu) / 12.0
    if rng is None or sigma == 0.0:
        steps = np.full(months, drift)
    else:
        steps = rng.normal(drift - sigma * sigma / 24.0, sigma / np.sqrt(12.0), months)
    return np.exp(np.concatenate(([0.0], np.cumsum(steps))))


#: The rises of the Bank of Israel rate the stress test tries, in yearly points.
STRESS_RISES = (0.01, 0.02, 0.03)


@dataclass(frozen=True, slots=True)
class Stress:
    rise: float
    #: The highest monthly payment over the whole term of the loan.
    highest_payment: float
    #: Paid to the bank until the sale.
    paid: float


def rate_stress(plan: HomePlan, series: HomeSeries) -> list[Stress]:
    """The mortgage if the anchor rate were higher from the second month on, all else as it is.

    The rate of month 1 is already set on the purchase day, so the anchor :math:`a_0` stays and
    :math:`a_k` becomes :math:`a_k + \\text{rise}` for :math:`k \\ge 1`: a prime track pays more
    from month 2, a variable one from its next reset. The highest payment is over the whole
    term, not until the sale: a reset after the planned sale would otherwise read as no risk.
    Empty when no payment would change.
    """
    months = max([plan.months, *(track.months for track in plan.tracks)])

    def payments(rise: float) -> FloatArray:
        anchor = series.anchor.copy()
        anchor[1:] += rise
        return combine([amortize(t, anchor, series.cpi) for t in plan.tracks], months).payment

    stressed = [(rise, payments(rise)) for rise in STRESS_RISES]
    # Fixed tracks, or a variable one that never resets within its term: nothing would move.
    if np.allclose(stressed[-1][1], payments(0.0)):
        return []
    return [
        Stress(rise, float(paid.max()), float(paid[: plan.months].sum())) for rise, paid in stressed
    ]


def run_home(plan: HomePlan, series: HomeSeries) -> HomeResult:
    """Run the apartment (see the module docstring)."""
    t = plan.months
    loan = plan.price - plan.equity
    if t < 1:
        raise PlanError("The apartment must be held for at least a month")
    if plan.price <= 0 or not 0 <= plan.equity <= plan.price:
        raise PlanError("The equity must be between zero and the price")
    lent = sum(track.amount for track in plan.tracks)
    if abs(lent - loan) > 1e-6 * max(plan.price, 1.0):
        raise PlanError("The tracks must add up to the price minus the equity")
    longest = max((track.months for track in plan.tracks), default=0)
    if len(series.value) <= t or len(series.rent) <= t or len(series.cpi) <= max(t, longest):
        raise PlanError("The series do not reach the sale or the end of the mortgage")

    schedules = [amortize(track, series.anchor, series.cpi) for track in plan.tracks]
    mortgage = combine(schedules, max(longest, t))
    tax = bracket_tax(plan.price, plan.purchase_tax)
    purchase_costs = tax + (plan.lawyer + plan.broker) * plan.price + plan.renovation

    dates = [add_months(plan.start, k) for k in range(t + 1)]
    cpi = series.cpi[: t + 1] / series.cpi[0]
    value = plan.price * series.value[: t + 1] / series.value[0]
    balance = np.concatenate(([loan], mortgage.balance[:t]))
    payment = np.concatenate(([0.0], mortgage.payment[:t]))
    costs = plan.maintenance * value / 12.0 + plan.insurance / 12.0 * cpi
    costs[0] = 0.0
    rent = np.zeros(t + 1)
    if plan.rent_mode is not RentMode.NONE:
        rent[1:] = plan.rent * series.rent[:t] / series.rent[0]
        if plan.rent_mode is RentMode.RENT_OUT:
            rent *= (1.0 - plan.vacancy) * (1.0 - plan.rent_tax)

    net_sale = value * (1.0 - plan.selling)
    cost = plan.price + purchase_costs if plan.cost is None else plan.cost
    bought = plan.start if plan.bought is None else plan.bought
    betterment = np.array(
        [
            betterment_tax(
                plan.betterment,
                value=float(value[k]),
                net_sale=float(net_sale[k]),
                indexed_cost=cost * float(cpi[k]),
                bought=bought,
                sold=dates[k],
            )
            if k
            else 0.0
            for k in range(t + 1)
        ]
    )
    net_worth = net_sale - balance * (1.0 + plan.early_repayment) - betterment

    flows = rent - payment - costs
    flows[0] = -(plan.equity + purchase_costs)
    flows[-1] += net_worth[-1]
    days = np.array([day_number(d) for d in dates])
    return HomeResult(
        loan=loan,
        purchase_tax=tax,
        purchase_costs=purchase_costs,
        schedules=schedules,
        mortgage=mortgage,
        dates=dates,
        value=value,
        balance=balance,
        payment=payment,
        costs=costs,
        rent=rent,
        betterment=betterment,
        net_worth=net_worth,
        xirr=xirr(days, flows),
        xirr_real=xirr(days, flows / cpi),
        net_worth_real=float(net_worth[-1] / cpi[-1]),
    )
