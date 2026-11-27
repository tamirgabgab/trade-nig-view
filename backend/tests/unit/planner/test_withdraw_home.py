"""Withdrawals with an owned apartment in the balance (J1): hand answers, an independent scalar
model, and properties."""

from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.models.bars import FloatArray
from app.planner.market import PlanError
from app.planner.withdraw import Cause, Grid, Home, Plan, Result, Rule, Sale, run
from tests.unit.planner.test_withdraw import growing, world

TAX = 0.25


def home(
    months: int,
    *,
    cash: float | list[float] = 0.0,
    worth: float | list[float] = 500_000.0,
    role: Sale = Sale.KEPT,
    sell_on: int = 0,
) -> Home:
    """An apartment that gives ``cash`` a month and would leave ``worth`` if sold."""
    flows = np.broadcast_to(np.asarray(cash, dtype=np.float64), (months + 1,)).copy()
    flows[0] = 0.0
    values = np.broadcast_to(np.asarray(worth, dtype=np.float64), (months + 1,)).copy()
    return Home(flows, values, role, sell_on)


def fixed(capital: float, amount: float, *, buy: float = 0.0) -> Plan:
    return Plan(capital, cost_share=1.0, amount=amount, indexed=False, buy=buy)


# ---------------------------------------------------------------- hand answers


def test_an_apartment_that_gives_nothing_leaves_the_account_as_without_it() -> None:
    plan, path = Plan(1_000_000, cost_share=0.4, amount=5_000), growing(36, 0.06)
    alone = run(plan, path)
    both = run(plan, path, home(36))
    for key in ("balance", "sold", "commission", "tax", "fee", "net", "due"):
        assert getattr(both, key) == pytest.approx(getattr(alone, key), rel=1e-12), key
    assert both.depleted == alone.depleted
    # It is still there: its worth on every date, and in what is left.
    assert both.home == pytest.approx(500_000)
    assert (both.home_sold, both.cause) == (None, None)
    assert both.liquidation == pytest.approx(alone.liquidation + 500_000)
    assert alone.home == pytest.approx(0.0)
    assert both.invested == pytest.approx(0.0)


def test_a_rent_equal_to_the_amount_leaves_the_account_untouched() -> None:
    result = run(fixed(1_000_000, 4_000), growing(24, 0.0), home(24, cash=4_000))
    assert result.balance == pytest.approx(1_000_000)
    assert result.sold == pytest.approx(0.0)
    assert result.net[1:] == pytest.approx(4_000)
    assert result.home_cash[1:] == pytest.approx(4_000)
    assert result.depleted is None


def test_a_rent_above_the_amount_is_invested_at_cost_with_the_buy_commission() -> None:
    # 1,000 a month more than the amount, a buy commission of 0.5 %: on a flat asset the account
    # gains 1,000 / 1.005 a month, and that money is all cost, so a later sale pays no tax.
    result = run(fixed(100_000, 4_000, buy=0.005), growing(12, 0.0), home(12, cash=5_000))
    added = 1_000 / 1.005
    assert result.invested[1:] == pytest.approx(1_000)
    assert result.commission[1:] == pytest.approx(1_000 - added)
    assert result.balance == pytest.approx(100_000 + added * np.arange(13))
    assert result.net[1:] == pytest.approx(4_000)
    assert result.liquidation == pytest.approx(result.balance[-1] + 500_000)


def test_the_apartments_costs_are_paid_from_the_account_before_the_withdrawal() -> None:
    # Owner costs and a mortgage of 2,000 a month beyond the rent: the account sells 5,000.
    result = run(fixed(100_000, 3_000), growing(6, 0.0), home(6, cash=-2_000))
    assert result.sold[1:] == pytest.approx(5_000)
    assert result.net[1:] == pytest.approx(3_000)
    assert result.balance[-1] == pytest.approx(70_000)


def test_a_sale_on_a_date_puts_its_net_into_the_account() -> None:
    worth = np.linspace(500_000, 560_000, 25)
    result = run(
        fixed(200_000, 5_000, buy=0.001),
        growing(24, 0.0),
        home(24, cash=1_000, worth=list(worth), role=Sale.ON_DATE, sell_on=12),
    )
    assert (result.home_sold, result.cause) == (12, Cause.PLANNED)
    # The month of the sale still has its rent; the months after it do not.
    assert result.home_cash[1:13] == pytest.approx(1_000)
    assert result.home_cash[13:] == pytest.approx(0.0)
    assert result.home[:12] == pytest.approx(worth[:12])
    assert result.home[12:] == pytest.approx(0.0)
    assert result.invested[12] == pytest.approx(worth[12])
    # Eleven months of 4,000 before it, then the sale's net bought in, then the month's 4,000.
    before = 200_000 - 11 * 4_000
    assert result.balance[12] == pytest.approx(before + worth[12] / 1.001 - 4_000, rel=1e-12)
    assert result.balance[24] == pytest.approx(result.balance[12] - 12 * 5_000)


def test_sold_when_the_account_is_empty() -> None:
    # J0's case: 1,000,000 that does not grow pays 10,000 a month for 100 months. Month 101 finds
    # nothing, so the apartment is sold then, and its 500,000 pays 50 months more.
    plan = fixed(1_000_000, 10_000)
    result = run(plan, growing(160, 0.0), home(160, role=Sale.WHEN_EMPTY))
    assert (result.home_sold, result.cause) == (101, Cause.EMPTY)
    assert result.net[1:151] == pytest.approx(10_000)
    assert result.depleted == 151
    assert result.balance[120] == pytest.approx(500_000 - 20 * 10_000)


def test_a_kept_apartment_is_not_sold_for_the_withdrawal() -> None:
    result = run(fixed(1_000_000, 10_000), growing(120, 0.0), home(120))
    assert result.depleted == 101
    assert result.net[101:] == pytest.approx(0.0)
    assert (result.home_sold, result.cause) == (None, None)
    assert result.liquidation == pytest.approx(500_000)


def test_a_kept_apartment_whose_costs_the_account_cannot_pay_is_sold() -> None:
    # 100,000 pays 9,000 and 1,000 of costs for ten months; the eleventh cannot pay the costs.
    result = run(fixed(100_000, 9_000), growing(24, 0.0), home(24, cash=-1_000))
    assert (result.home_sold, result.cause) == (11, Cause.FORCED)
    assert result.depleted is None
    assert result.net[1:] == pytest.approx(9_000)
    assert result.balance[24] == pytest.approx(500_000 - 14 * 10_000)


def test_a_sale_that_owes_more_than_it_brings_is_paid_from_the_account() -> None:
    # The loan and the costs of the sale are above the value: the sale takes 10,000.
    result = run(
        fixed(100_000, 1_000), growing(6, 0.0), home(6, worth=-10_000, role=Sale.ON_DATE, sell_on=3)
    )
    assert result.home_sold == 3
    assert result.sold[3] == pytest.approx(11_000)
    assert result.balance[-1] == pytest.approx(100_000 - 6 * 1_000 - 10_000)


def test_a_capital_of_zero_with_an_apartment() -> None:
    result = run(fixed(0.0, 4_000), growing(12, 0.0), home(12, cash=5_000))
    assert result.balance == pytest.approx(1_000 * np.arange(13))
    assert result.depleted is None
    # Without the rent there is nothing to pay from: the apartment is sold when it is empty.
    empty = run(fixed(0.0, 4_000), growing(12, 0.0), home(12, role=Sale.WHEN_EMPTY))
    assert (empty.home_sold, empty.cause, empty.depleted) == (1, Cause.EMPTY, None)


def test_the_percent_rule_adds_the_apartments_cash_to_the_income() -> None:
    # 6 % a year of a flat 1,200,000 is 6,000 a month, plus a rent of 2,500; the balance does not
    # depend on the cost share while the sale pays the apartment's shortfall.
    path = growing(24, 0.0)
    plans = [Plan(1_200_000, cost_share=c, rule=Rule.PERCENT, percent=0.06) for c in (0.0, 1.0)]
    floor, ceiling = (run(p, path, home(24, cash=2_500)) for p in plans)
    assert floor.balance == pytest.approx(ceiling.balance)
    assert ceiling.net[1] == pytest.approx(6_000 + 2_500)
    assert floor.net[1] == pytest.approx(6_000 * (1 - TAX) + 2_500)
    assert floor.invested == pytest.approx(0.0)


def test_the_percent_rule_sells_more_when_the_apartment_needs_it() -> None:
    result = run(
        Plan(1_000_000, cost_share=1.0, rule=Rule.PERCENT, percent=0.01),
        growing(6, 0.0),
        home(6, cash=-5_000),
    )
    assert result.sold[1:] == pytest.approx(5_000)
    assert result.net[1:] == pytest.approx(0.0)


def test_an_account_empty_is_not_the_end_while_the_apartment_pays() -> None:
    result = run(
        Plan(0.0, cost_share=1.0, rule=Rule.PERCENT, percent=0.04),
        growing(6, 0.0),
        home(6, cash=3_000),
    )
    assert result.depleted is None
    assert result.net[1:] == pytest.approx(3_000)


@pytest.mark.parametrize(
    ("plan", "apartment", "message"),
    [
        (fixed(0.0, 1_000), None, "capital"),
        (fixed(1_000, 1_000), home(3, role=Sale.ON_DATE, sell_on=0), "sale"),
        (fixed(1_000, 1_000), home(3, role=Sale.ON_DATE, sell_on=4), "sale"),
        (fixed(1_000, 1_000), Home(np.zeros(3), np.zeros(4)), "apartment"),
    ],
)
def test_plans_with_an_apartment_that_cannot_run(
    plan: Plan, apartment: Home | None, message: str
) -> None:
    with pytest.raises(PlanError, match=message):
        run(plan, growing(3, 0.0), apartment)


# ---------------------------------------------------------------- an independent scalar model


def golden(  # noqa: PLR0912, PLR0915 - one plain loop, as the engine's docstring reads
    plan: Plan, path: Grid, apartment: Home
) -> dict[str, list[float]]:
    """The plan month by month with plain floats; every fraction found by bisection."""
    months, assets = path.unit.shape
    total = sum(plan.weights)
    shares = [w / total for w in plan.weights]
    units = [plan.capital * s / path.unit[0, a] for a, s in enumerate(shares)]
    basis = [plan.cost_share * plan.capital * s / path.level[0, a] for a, s in enumerate(shares)]
    carried = 0.0
    rate = 1 - (1 - plan.management) ** (1 / 12)
    held, sold_on = True, -1.0
    out: dict[str, list[float]] = {
        k: [0.0] for k in ("sold", "tax", "fee", "net", "commission", "invested", "home_cash")
    }
    out["balance"] = [plan.capital]
    out["home"] = [float(apartment.worth[0])]

    def buy(money: float, k: int) -> None:
        for a in range(assets):
            units[a] += money * shares[a] / ((1 + plan.buy) * path.unit[k, a])
            basis[a] += money * shares[a] / path.level[k, a]

    for k in range(1, months):
        for a in range(assets):
            basis[a] += units[a] * path.reinvested[k, a]
        invested, commission, owed = 0.0, 0.0, 0.0
        due = plan.amount * (path.cpi[k] / path.cpi[0] if plan.indexed else 1.0)
        due = due if plan.rule is Rule.FIXED else 0.0
        cash = float(apartment.cash[k]) if held else 0.0

        def state() -> tuple[float, float, float]:
            value = sum(units[a] * path.unit[k, a] for a in range(assets))  # noqa: B023
            cost = sum(basis[a] * path.level[k, a] for a in range(assets))  # noqa: B023
            return value, cost, min(value, value * rate + plan.monthly_fee)

        def leaves(f: float, value: float, cost: float) -> tuple[float, float]:
            gain = f * (value * (1 - plan.sell) - cost)
            tax = plan.gains_tax * max(gain - carried, 0.0)  # noqa: B023
            return tax, f * value * (1 - plan.sell) - tax

        def fraction_for(need: float, value: float, cost: float) -> float:
            if need <= 0 or value <= 0:
                return 0.0
            if leaves(1.0, value, cost)[1] <= need:
                return 1.0
            low, high = 0.0, 1.0
            for _ in range(200):
                middle = (low + high) / 2
                low, high = (
                    (middle, high) if leaves(middle, value, cost)[1] < need else (low, middle)
                )
            return (low + high) / 2

        value, cost, fee_due = state()
        if held:
            duty = fee_due - cash
            can_duty = duty <= 0 or leaves(1.0, value, cost)[1] >= duty - 0.005
            can_all = leaves(1.0, value, cost)[1] >= due + duty - 0.005
            planned = apartment.role is Sale.ON_DATE and k == apartment.sell_on
            empty = apartment.role is Sale.WHEN_EMPTY and not can_all
            if planned or empty or not can_duty:
                held, sold_on = False, k
                worth = float(apartment.worth[k])
                if worth > 0:
                    buy(worth, k)
                    invested += worth
                    commission += worth * plan.buy / (1 + plan.buy)
                else:
                    owed = -worth
                value, cost, fee_due = state()
        duty = fee_due - cash + owed
        if plan.rule is Rule.FIXED:
            fraction = fraction_for(due + duty, value, cost)
        else:
            least = fraction_for(duty, value, cost)
            fraction = max(min(plan.percent / 12, 1.0), least) if value > 0 else 0.0
        if (1 - fraction) * value < 0.005:
            fraction = 1.0 if value > 0 else 0.0
        tax, left = leaves(fraction, value, cost)
        gain = fraction * (value * (1 - plan.sell) - cost)
        carried = carried - gain if gain < 0 else max(carried - gain, 0.0)
        for a in range(assets):
            units[a] *= 1 - fraction
            basis[a] *= 1 - fraction
        available = left + cash - owed
        fee = min(fee_due, max(available, 0.0))
        rest = available - fee
        if plan.rule is Rule.FIXED:
            net = min(max(rest, 0.0), due)
            surplus = rest - due
            if surplus > 0:
                buy(surplus, k)
                invested += surplus
                commission += surplus * plan.buy / (1 + plan.buy)
        else:
            net = max(rest, 0.0)
        out["sold"].append(fraction * value)
        out["commission"].append(fraction * value * plan.sell + commission)
        out["tax"].append(tax)
        out["fee"].append(fee)
        out["net"].append(net)
        out["invested"].append(invested)
        out["home_cash"].append(cash)
        out["balance"].append(sum(units[a] * path.unit[k, a] for a in range(assets)))
        out["home"].append(float(apartment.worth[k]) if held else 0.0)
    out["home_sold"] = [sold_on]
    return out


def check(result: Result, model: dict[str, list[float]]) -> None:
    sold = model.pop("home_sold")[0]
    assert result.home_sold == (None if sold < 0 else sold)
    for key, values in model.items():
        assert getattr(result, key) == pytest.approx(values, rel=1e-9, abs=1e-6), key


def flows(seed: int, months: int = 48) -> tuple[FloatArray, FloatArray]:
    rng = np.random.default_rng(seed + 100)
    cash = rng.normal(-500, 3_000, months + 1)
    worth = 800_000 * np.exp(np.cumsum(rng.normal(0.003, 0.01, months + 1)))
    return cash, worth


PLANS = [
    Plan(300_000, (5, 3, 2), 0.3, Rule.FIXED, 9_000, True, sell=0.004, buy=0.002, management=0.006),
    Plan(900_000, (1, 1, 1), 1.0, Rule.FIXED, 2_000, False, sell=0.01, buy=0.001),  # surpluses
    Plan(200_000, (2, 1, 0), 0.7, Rule.PERCENT, percent=0.05, management=0.01, monthly_fee=20),
    Plan(50_000, (1, 2, 3), 0.0, Rule.PERCENT, percent=0.4, sell=0.002),
]


@pytest.mark.parametrize("seed", [1, 2, 3])
@pytest.mark.parametrize("plan", PLANS)
@pytest.mark.parametrize(
    ("role", "sell_on"), [(Sale.KEPT, 0), (Sale.ON_DATE, 20), (Sale.WHEN_EMPTY, 0)]
)
def test_the_engine_is_the_scalar_model(plan: Plan, role: Sale, sell_on: int, seed: int) -> None:
    path = world(seed)
    cash, worth = flows(seed)
    apartment = Home(cash, worth, role, sell_on)
    result = run(plan, path, apartment)
    check(result, golden(plan, path, apartment))
    assert np.all(result.balance >= -1e-9)
    assert np.all(result.net >= -1e-9)


# ---------------------------------------------------------------- properties


@settings(max_examples=60, deadline=None)
@given(
    rent=st.floats(0, 20_000),
    amount=st.floats(100, 20_000),
    share=st.floats(0, 1),
    role=st.sampled_from([Sale.KEPT, Sale.WHEN_EMPTY]),
)
def test_a_higher_rent_never_leaves_less(
    rent: float, amount: float, share: float, role: Sale
) -> None:
    path = world(7, months=60, assets=2)
    plan = Plan(400_000, (1, 1), share, Rule.FIXED, amount, True, sell=0.003)
    low = run(plan, path, home(60, cash=rent, role=role))
    high = run(plan, path, home(60, cash=rent + 1_000, role=role))
    assert high.net.sum() >= low.net.sum() - 1e-6
    assert high.balance[-1] + high.home[-1] >= low.balance[-1] + low.home[-1] - 1e-6
