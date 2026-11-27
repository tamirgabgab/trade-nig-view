"""Withdrawals from an account: hand answers, an independent scalar model, and properties."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.models.bars import FloatArray
from app.planner.deposits import Deposit, add_months, day_number
from app.planner.inflation import CpiPath
from app.planner.market import PlanError, TaxBase, Taxes, run_market
from app.planner.mortgage import annuity
from app.planner.withdraw import Grid, Plan, Result, Rule, assumed_grid, run, sample
from tests.unit.planner.test_market import FLAT_CPI, START, asset
from tests.unit.planner.test_scenario import grower

TAX = 0.25


def grid(
    units: list[float] | FloatArray,
    *,
    cpi: list[float] | None = None,
    real: bool = False,
    reinvested: list[float] | None = None,
) -> Grid:
    """One asset whose unit is worth ``units`` on the month dates."""
    unit = np.asarray(units, dtype=np.float64)[:, None]
    months = len(unit)
    prices = np.ones(months) if cpi is None else np.asarray(cpi, dtype=np.float64)
    added = np.zeros((months, 1)) if reinvested is None else np.asarray(reinvested)[:, None]
    return Grid(unit, added, prices[:, None] if real else np.ones((months, 1)), prices)


def growing(months: int, yearly: float) -> Grid:
    return grid((1.0 + yearly) ** (np.arange(months + 1) / 12.0))


# ---------------------------------------------------------------- hand answers


def test_a_fixed_amount_is_an_annuity_in_reverse() -> None:
    # Everything sold is gain (cost share 0): a net of N needs a sale of N / (1 - tax). On an
    # asset that grows by i a month the balance is a loan's: B_k = B_{k-1} (1 + i) - G.
    months, i = 120, 1.06 ** (1 / 12) - 1
    gross = annuity(1_000_000, i, months)  # the sale that empties it in exactly 120 months
    plan = Plan(1_000_000, cost_share=0.0, amount=gross * (1 - TAX), indexed=False)
    result = run(plan, growing(months, 0.06))
    k = np.arange(months + 1)
    closed = 1_000_000 * (1 + i) ** k - gross * ((1 + i) ** k - 1) / i
    assert result.balance == pytest.approx(closed, abs=1e-4)
    assert result.sold[1:] == pytest.approx(gross)
    assert result.tax[1:] == pytest.approx(TAX * gross)
    assert result.net[1:] == pytest.approx(plan.amount)
    assert result.depleted is None
    assert result.balance[-1] == pytest.approx(0.0, abs=1e-4)
    # One shekel more a month and the last month cannot be paid in full.
    more = run(
        Plan(1_000_000, cost_share=0.0, amount=plan.amount + 1, indexed=False),
        growing(months, 0.06),
    )
    assert more.depleted == months
    assert 0 < more.net[-1] < plan.amount + 1
    assert more.balance[-1] == 0.0


def test_a_percent_rule_never_ends_and_its_balance_ignores_the_cost_share() -> None:
    months, percent = 60, 0.06
    world = growing(months, 0.04)
    k = np.arange(months + 1)
    closed = 500_000 * 1.04 ** (k / 12) * (1 - percent / 12) ** k
    balances: list[Result] = []
    for share in (0.0, 0.5, 1.0):
        result = run(Plan(500_000, cost_share=share, rule=Rule.PERCENT, percent=percent), world)
        assert result.balance == pytest.approx(closed)
        assert result.depleted is None
        # What is sold is the percent; the income is what the tax leaves of it.
        assert result.sold[1:] == pytest.approx(closed[:-1] * 1.04 ** (1 / 12) * percent / 12)
        balances.append(result)
    floor, middle, ceiling = balances
    assert floor.net[1:] == pytest.approx((1 - TAX) * floor.sold[1:])
    assert np.all(floor.net[1:] < middle.net[1:])
    assert np.all(middle.net[1:] < ceiling.net[1:])


def test_the_floor_and_the_ceiling_of_the_tax() -> None:
    # The floor: nothing was paid for the capital, so every sale is all gain.
    floor = run(
        Plan(1_000, cost_share=0.0, rule=Rule.PERCENT, percent=0.12, sell=0.01), growing(12, 0.1)
    )
    assert floor.commission[1:] == pytest.approx(0.01 * floor.sold[1:])
    assert floor.net[1:] == pytest.approx((1 - TAX) * (1 - 0.01) * floor.sold[1:])
    # The ceiling on an asset that does not move: nothing was gained, nothing is taxed.
    ceiling = run(Plan(1_000, cost_share=1.0, rule=Rule.PERCENT, percent=0.12), growing(12, 0.0))
    assert np.all(ceiling.tax == 0.0)
    assert ceiling.net[1:] == pytest.approx(ceiling.sold[1:])


def test_a_cost_share_in_between_by_hand() -> None:
    # 1,000,000 of which half is cost; a month later it is worth 1,100,000. A net of 10,000:
    # selling a fraction f brings 1,100,000 f and a gain of 600,000 f, taxed at 25 %.
    result = run(Plan(1_000_000, cost_share=0.5, amount=10_000, indexed=False), grid([1.0, 1.1]))
    fraction = 10_000 / (1_100_000 - TAX * 600_000)
    assert result.sold[1] == pytest.approx(1_100_000 * fraction)
    assert result.tax[1] == pytest.approx(TAX * 600_000 * fraction)
    assert result.net[1] == pytest.approx(10_000)
    assert result.balance[1] == pytest.approx(1_100_000 * (1 - fraction))


def test_a_loss_is_carried_and_offsets_a_later_gain() -> None:
    # 1,000 bought at 1; 1 % sold a month. Month 1 at 0.8: 8 for a cost of 10, a loss of 2.
    # Month 2 at 1.5: 14.85 for a cost of 9.9, a gain of 4.95, of which 2.95 is taxed.
    plan = Plan(1_000, cost_share=1.0, rule=Rule.PERCENT, percent=0.12)
    result = run(plan, grid([1.0, 0.8, 1.5]))
    assert result.sold[1:] == pytest.approx([8.0, 14.85])
    assert result.tax[1:] == pytest.approx([0.0, TAX * 2.95])
    assert result.net[1:] == pytest.approx([8.0, 14.85 - TAX * 2.95])


def test_a_fixed_amount_sells_through_the_point_where_the_carried_loss_ends() -> None:
    # Month 1 sells at a loss, which is carried. In month 2 the first part of the gain is free
    # and the rest is taxed: the fraction to sell has a kink there. Checked against the scalar
    # model below, which finds the fraction by bisection.
    path = grid([1.0, 0.8, 1.5, 1.5, 1.6])
    plan = Plan(1_000, cost_share=1.0, amount=20, indexed=False)
    result = run(plan, path)
    assert_equal(result, golden(plan, path))
    assert result.tax[1] == 0.0
    untouched = TAX * (result.sold[2] - result.sold[2] / 1.5)  # the tax with nothing carried
    assert 0.0 < result.tax[2] < untouched
    assert result.net[1:] == pytest.approx(20.0)


def test_the_real_base_taxes_only_what_beat_inflation() -> None:
    prices = [1.0, 1.02, 1.04]
    # The asset rises exactly with the CPI: a nominal gain, no real one.
    nominal = run(
        Plan(1_000, cost_share=1.0, rule=Rule.PERCENT, percent=0.12), grid(prices, cpi=prices)
    )
    real = run(
        Plan(1_000, cost_share=1.0, rule=Rule.PERCENT, percent=0.12),
        grid(prices, cpi=prices, real=True),
    )
    assert np.all(nominal.tax[1:] > 0)
    assert real.tax[1:] == pytest.approx(0.0, abs=1e-12)


def test_reinvested_dividends_join_the_cost() -> None:
    # 40 of net dividends were reinvested per unit before the sale: they were bought, not gained.
    plain = run(Plan(1_000, cost_share=0.0, rule=Rule.PERCENT, percent=0.12), grid([1.0, 1.2]))
    with_cost = run(
        Plan(1_000, cost_share=0.0, rule=Rule.PERCENT, percent=0.12),
        grid([1.0, 1.2], reinvested=[0.0, 0.04]),
    )
    assert plain.tax[1] == pytest.approx(TAX * 12.0)
    assert with_cost.tax[1] == pytest.approx(TAX * (12.0 - 0.01 * 40.0))


def test_an_indexed_amount_keeps_its_buying_power() -> None:
    prices = list(1.03 ** (np.arange(25) / 12))
    plan = Plan(1_000_000, amount=4_000)
    result = run(plan, grid(np.ones(25), cpi=prices))
    assert result.due[1:] == pytest.approx(4_000 * np.array(prices[1:]))
    assert result.net[1:] == pytest.approx(result.due[1:])
    flat = run(Plan(1_000_000, amount=4_000, indexed=False), grid(np.ones(25), cpi=prices))
    assert flat.net[1:] == pytest.approx(4_000)


def test_when_the_money_ends_the_month_pays_what_is_left_and_the_rest_nothing() -> None:
    result = run(Plan(10_000, cost_share=1.0, amount=3_000, indexed=False), growing(6, 0.0))
    assert result.net[1:] == pytest.approx([3_000, 3_000, 3_000, 1_000, 0, 0])
    assert result.balance[1:] == pytest.approx([7_000, 4_000, 1_000, 0, 0, 0])
    assert result.depleted == 4
    assert result.due[1:] == pytest.approx(3_000)
    assert result.liquidation == 0.0


def test_the_account_fee_is_paid_from_the_months_sale() -> None:
    # 1.2 % a year and 10 a month, on a flat 100,000: the fee joins what has to be sold.
    rate = 1 - (1 - 0.012) ** (1 / 12)
    plan = Plan(
        100_000, cost_share=1.0, amount=500, indexed=False, management=0.012, monthly_fee=10
    )
    result = run(plan, growing(3, 0.0))
    assert result.fee[1] == pytest.approx(100_000 * rate + 10)
    assert result.sold[1] == pytest.approx(500 + result.fee[1])
    assert result.net[1:] == pytest.approx(500)
    # Under the percent rule the fee comes out of the income; a sale too small for it grows.
    small = Plan(1_000, cost_share=1.0, rule=Rule.PERCENT, percent=0.012, monthly_fee=50)
    tiny = run(small, growing(2, 0.0))
    assert tiny.sold[1] == pytest.approx(50)
    assert (tiny.fee[1], tiny.net[1]) == pytest.approx((50, 0))


def test_what_a_sale_of_everything_would_leave_at_the_end() -> None:
    result = run(
        Plan(1_000, cost_share=0.4, rule=Rule.PERCENT, percent=0.0, sell=0.02), grid([1.0, 2.0])
    )
    assert result.balance[1] == pytest.approx(2_000)
    proceeds = 2_000 * 0.98
    assert result.liquidation == pytest.approx(proceeds - TAX * (proceeds - 400))


@pytest.mark.parametrize(
    ("plan", "message"),
    [
        (Plan(0.0, amount=1), "capital"),
        (Plan(1_000, cost_share=1.5, amount=1), "cost share"),
        (Plan(1_000, amount=-1), "amount"),
        (Plan(1_000, rule=Rule.PERCENT, percent=13.0), "percent"),
        (Plan(1_000, weights=(1.0, 1.0), amount=1), "weights"),
    ],
)
def test_plans_that_cannot_run(plan: Plan, message: str) -> None:
    with pytest.raises(PlanError, match=message):
        run(plan, growing(3, 0.0))


# ---------------------------------------------------------------- an independent scalar model


def golden(plan: Plan, world: Grid) -> dict[str, list[float]]:
    """The same plan with plain floats, month by month; the fraction to sell found by bisection."""
    months, assets = world.unit.shape
    total = sum(plan.weights)
    units = [plan.capital * w / total / world.unit[0, a] for a, w in enumerate(plan.weights)]
    basis = [
        plan.cost_share * plan.capital * w / total / world.level[0, a]
        for a, w in enumerate(plan.weights)
    ]
    carried = 0.0
    rate = 1 - (1 - plan.management) ** (1 / 12)
    out: dict[str, list[float]] = {
        key: [0.0] for key in ("sold", "tax", "fee", "net", "commission")
    }
    out["balance"] = [plan.capital]
    for k in range(1, months):
        for a in range(assets):
            basis[a] += units[a] * world.reinvested[k, a]
        value = sum(units[a] * world.unit[k, a] for a in range(assets))
        cost = sum(basis[a] * world.level[k, a] for a in range(assets))
        fee_due = min(value, value * rate + plan.monthly_fee)

        def outcome(f: float) -> tuple[float, float]:
            """(tax, what is left of the sale after commission and tax) for a fraction ``f``."""
            gain = f * (value * (1 - plan.sell) - cost)  # noqa: B023 - used inside the month
            tax = plan.gains_tax * max(gain - carried, 0.0)  # noqa: B023
            return tax, f * value * (1 - plan.sell) - tax  # noqa: B023

        def fraction_for(need: float) -> float:
            if outcome(1.0)[1] <= need:
                return 1.0
            low, high = 0.0, 1.0
            for _ in range(200):
                middle = (low + high) / 2
                low, high = (middle, high) if outcome(middle)[1] < need else (low, middle)
            return (low + high) / 2

        if plan.rule is Rule.FIXED:
            due = plan.amount * (world.cpi[k] / world.cpi[0] if plan.indexed else 1.0)
            fraction = fraction_for(due + fee_due) if value > 0 else 0.0
        else:
            fraction = max(min(plan.percent / 12, 1.0), fraction_for(fee_due)) if value > 0 else 0.0
        tax, left = outcome(fraction)
        gain = fraction * (value * (1 - plan.sell) - cost)
        carried = max(carried - gain, 0.0) if gain >= 0 else carried - gain
        fee = min(fee_due, left)
        for a in range(assets):
            units[a] *= 1 - fraction
            basis[a] *= 1 - fraction
        out["sold"].append(fraction * value)
        out["commission"].append(fraction * value * plan.sell)
        out["tax"].append(tax)
        out["fee"].append(fee)
        out["net"].append(left - fee)
        out["balance"].append((1 - fraction) * value)
    return out


def assert_equal(result: object, model: dict[str, list[float]]) -> None:
    for key, values in model.items():
        assert getattr(result, key) == pytest.approx(values, rel=1e-9, abs=1e-6), key


def world(seed: int, months: int = 48, assets: int = 3) -> Grid:
    """A world with assets that fall and rise, dividends reinvested, and inflation."""
    rng = np.random.default_rng(seed)
    steps = rng.normal(0.004, 0.05, (months, assets))
    unit = np.vstack([np.ones(assets), np.exp(np.cumsum(steps, axis=0))]) * rng.uniform(
        10, 200, assets
    )
    cpi = np.concatenate([[100.0], 100 * np.exp(np.cumsum(rng.normal(0.002, 0.002, months)))])
    reinvested = np.vstack(
        [np.zeros(assets), np.abs(rng.normal(0.0, 0.002, (months, assets))) * unit[1:]]
    )
    return Grid(unit, reinvested / cpi[:, None], np.repeat(cpi[:, None], assets, axis=1), cpi)


@pytest.mark.parametrize("seed", [1, 2, 3, 4])
@pytest.mark.parametrize(
    "plan",
    [
        Plan(
            900_000,
            (5, 3, 2),
            0.3,
            Rule.FIXED,
            6_000,
            True,
            sell=0.004,
            management=0.006,
            monthly_fee=12,
        ),
        Plan(900_000, (1, 1, 1), 1.0, Rule.FIXED, 30_000, False, sell=0.01),  # runs out
        Plan(900_000, (2, 1, 0), 0.7, Rule.PERCENT, percent=0.05, management=0.01, monthly_fee=20),
        Plan(900_000, (1, 2, 3), 0.0, Rule.PERCENT, percent=0.4, sell=0.002),
    ],
)
def test_the_engine_is_the_scalar_model(plan: Plan, seed: int) -> None:
    path = world(seed)
    result = run(plan, path)
    assert_equal(result, golden(plan, path))
    # Every month: what was sold is the commission, the tax, the fee and the income.
    assert result.sold == pytest.approx(result.commission + result.tax + result.fee + result.net)
    assert np.all(result.balance >= 0)
    assert np.all(result.net >= -1e-9)


# ---------------------------------------------------------------- properties

growth_paths = st.lists(st.floats(0.85, 1.2), min_size=2, max_size=40)


@settings(max_examples=60, deadline=None)
@given(steps=growth_paths, low=st.floats(0, 1), high=st.floats(0, 1), amount=st.floats(100, 20_000))
def test_a_lower_cost_share_never_pays_more_or_lasts_longer(
    steps: list[float], low: float, high: float, amount: float
) -> None:
    low, high = sorted((low, high))
    path = grid(np.concatenate([[1.0], np.cumprod(steps)]))
    months = len(steps)
    worse = run(Plan(100_000, cost_share=low, amount=amount, indexed=False), path)
    better = run(Plan(100_000, cost_share=high, amount=amount, indexed=False), path)
    assert (worse.depleted or months + 1) <= (better.depleted or months + 1)
    assert worse.net.sum() <= better.net.sum() + 1e-6
    assert np.all(worse.balance <= better.balance + 1e-6)
    # Under the percent rule the balance is the same whatever was paid for the capital.
    one = run(Plan(100_000, cost_share=low, rule=Rule.PERCENT, percent=0.06), path)
    other = run(Plan(100_000, cost_share=high, rule=Rule.PERCENT, percent=0.06), path)
    assert one.balance == pytest.approx(other.balance)
    assert one.net.sum() <= other.net.sum() + 1e-6


@settings(max_examples=60, deadline=None)
@given(steps=growth_paths, seed=st.integers(0, 1000))
def test_the_order_of_the_months_matters_for_a_fixed_amount_only(
    steps: list[float], seed: int
) -> None:
    shuffled = list(np.random.default_rng(seed).permutation(steps))
    paths = [grid(np.concatenate([[1.0], np.cumprod(order)])) for order in (steps, shuffled)]
    percent = [
        run(Plan(100_000, rule=Rule.PERCENT, percent=0.05), path).balance[-1] for path in paths
    ]
    assert percent[0] == pytest.approx(percent[1])


def test_sequence_risk_bad_years_first_cost_a_fixed_amount_more() -> None:
    good, bad = [1.03] * 12, [0.97] * 12
    plan = Plan(100_000, cost_share=1.0, amount=1_500, indexed=False)
    first_bad = run(plan, grid(np.concatenate([[1.0], np.cumprod(bad + good)])))
    first_good = run(plan, grid(np.concatenate([[1.0], np.cumprod(good + bad)])))
    assert first_bad.balance[-1] < first_good.balance[-1]


# ---------------------------------------------------------------- the grid of a realization


def test_an_assumed_return_is_compounded_monthly() -> None:
    cpi = 1.02 ** (np.arange(25) / 12)
    nominal = assumed_grid(24, 0.05, cpi)
    assert nominal.unit[:, 0] == pytest.approx(1.05 ** (np.arange(25) / 12))
    assert np.all(nominal.reinvested == 0)
    assert np.all(nominal.level == 1)
    assert assumed_grid(24, 0.05, cpi, real=True).level[:, 0] == pytest.approx(cpi)
    assert nominal.cpi == pytest.approx(cpi)


def test_the_grid_of_real_assets_is_read_on_the_month_dates() -> None:
    start = date(2020, 1, 15)
    sampled = sample([grower(0.08), grower(0.03)], start, 24, Taxes(), FLAT_CPI)
    days = np.array([day_number(add_months(start, k)) for k in range(25)])
    for column, rate in enumerate((0.08, 0.03)):
        ratio = sampled.unit[:, column] / sampled.unit[0, column]
        assert ratio == pytest.approx((1 + rate) ** ((days - days[0]) / 365.25))
    assert sampled.unit.shape == (25, 2)
    assert np.all(sampled.reinvested == 0)  # no dividends
    assert np.all(sampled.level == 1)  # the nominal base
    with pytest.raises(PlanError, match="no data before"):
        sample([grower(0.08)], date(2019, 1, 15), 12, Taxes(), FLAT_CPI)
    with pytest.raises(PlanError, match="no data after"):
        sample([grower(0.08, years=2)], start, 36, Taxes(), FLAT_CPI)


@pytest.mark.parametrize("base", [TaxBase.NOMINAL, TaxBase.REAL])
def test_with_nothing_withdrawn_the_end_is_the_market_accounts(base: TaxBase) -> None:
    # 36 months of an asset with dividends, bought on the first day and never touched: selling
    # it all at the end leaves what the Market tab's account leaves (dividend tax on the way,
    # reinvested dividends in the cost, the cost indexed on the real base).
    taxes = Taxes(gains=0.25, dividend=0.25, base=base)
    cpi = CpiPath(
        np.array([day_number(START) - 40, day_number(START) + 1200]), np.array([100.0, 110.0])
    )
    held = asset(dividends=True, seed=3)
    months = 36
    # Month date 36 is a Sunday: both sell on the Monday after it.
    assert add_months(START, months) == date(2023, 1, 1)
    market = run_market([held], [Deposit(START, 100_000)], date(2023, 1, 2), taxes=taxes, cpi=cpi)
    nothing = Plan(100_000, cost_share=1.0, rule=Rule.PERCENT, percent=0.0, gains_tax=0.25)
    result = run(nothing, sample([held], START, months, taxes, cpi))
    assert result.balance[-1] == pytest.approx(market.value)
    assert result.liquidation == pytest.approx(market.net_value)
