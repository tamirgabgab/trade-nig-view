"""Withdrawals from an account whose purchases are known (J4): first in, first out, by hand,
against an independent scalar model, and against the Market tab's account at the handover."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from app.planner.deposits import Deposit, day_number
from app.planner.inflation import CpiPath
from app.planner.market import Fees, Lot, PlanError, TaxBase, Taxes, run_market
from app.planner.withdraw import (
    Grid,
    Home,
    Lots,
    Plan,
    Rule,
    Sale,
    handover,
    run,
    run_many,
    sample,
)
from app.planner.withdraw_study import stack, stack_homes
from tests.unit.planner.test_market import asset
from tests.unit.planner.test_withdraw import growing, world
from tests.unit.planner.test_withdraw_home import PLANS, flows, home

TAX = 0.25
ACCOUNT_PLANS = [
    Plan(900_000, (5, 3, 2), 0.3, Rule.FIXED, 6_000, True, sell=0.004, management=0.006),
    Plan(900_000, (1, 1, 1), 1.0, Rule.FIXED, 30_000, False, sell=0.01),  # runs out
    Plan(900_000, (2, 1, 0), 0.7, Rule.PERCENT, percent=0.05, management=0.01, monthly_fee=20),
]
FIELDS = (
    "balance", "sold", "commission", "tax", "fee", "net", "home", "home_cash", "invested",
)  # fmt: skip


def lots(*pairs: tuple[float, float]) -> Lots:
    """Lots of one asset, oldest first: (units, cost)."""
    return Lots(np.array([[u] for u, _ in pairs]), np.array([[c] for _, c in pairs]))


# ---------------------------------------------------------------- hand answers


def test_the_oldest_lot_is_sold_first() -> None:
    # An asset at 1: a thousand units that cost 400 (60 % gain), then a thousand at cost. A net
    # 425 sells 500 of the old lot (tax 75); the next 625 ends it (500 more, tax 75) and takes
    # 200 of the second, which has no gain.
    held = lots((1_000, 400), (1_000, 1_000))
    plan = Plan(0.0, amount=425, indexed=False)
    first = run(plan, growing(1, 0.0), lots=held)
    assert first.balance[0] == pytest.approx(2_000)
    assert (first.sold[1], first.tax[1], first.net[1]) == pytest.approx((500, 75, 425))
    crossing = run(Plan(0.0, amount=1_050, indexed=False), growing(1, 0.0), lots=held)
    assert (crossing.sold[1], crossing.tax[1]) == pytest.approx((1_200, 150))
    assert crossing.net[1] == pytest.approx(1_050)
    # One pooled lot at the same overall cost sells less at first: it spreads the gain evenly.
    pooled = run(Plan(2_000, cost_share=0.7, amount=425, indexed=False), growing(1, 0.0))
    assert pooled.sold[1] == pytest.approx(425 / (1 - TAX * 0.3))
    assert pooled.sold[1] < first.sold[1]


def test_what_is_left_and_its_tax_follow_the_lots() -> None:
    held = lots((1_000, 400), (1_000, 1_000))
    result = run(Plan(0.0, amount=425, indexed=False), growing(2, 0.0), lots=held)
    # Two months of 425 end the old lot's gain: 1,000 sold, 150 of tax, and what is left is cost.
    assert result.balance[-1] == pytest.approx(1_000)
    assert result.tax.sum() == pytest.approx(150)
    assert result.liquidation == pytest.approx(1_000)


def test_money_invested_later_is_a_new_lot_sold_last() -> None:
    # A hundred units that cost nothing, and an apartment that gives 50 in month 1 and takes 30
    # in month 2. The 50 are bought at cost; the 30 are paid from the oldest lot, all gain.
    held = lots((100, 0))
    cash = [0.0, 50.0, -30.0]
    result = run(Plan(0.0, amount=0.0), growing(2, 0.0), home(2, cash=cash), lots=held)
    assert result.invested[1] == pytest.approx(50)
    assert (result.sold[2], result.tax[2]) == pytest.approx((40, 10))
    assert result.balance[2] == pytest.approx(110)


def test_one_lot_is_the_pooled_account() -> None:
    path = world(2)
    for plan in ACCOUNT_PLANS:
        shares = np.asarray(plan.weights, dtype=np.float64) / sum(plan.weights)
        one = Lots(
            (plan.capital * shares / path.unit[0])[None],
            (plan.cost_share * plan.capital * shares / path.level[0])[None],
        )
        pooled, exact = run(plan, path), run(plan, path, lots=one)
        for key in ("balance", "sold", "tax", "fee", "net"):
            assert getattr(exact, key) == pytest.approx(getattr(pooled, key), rel=1e-9, abs=1e-6)
        assert exact.depleted == pooled.depleted
        assert exact.liquidation == pytest.approx(pooled.liquidation, rel=1e-9, abs=1e-6)


def test_selling_everything_leaves_nothing() -> None:
    # Many lots, and a percent of 1,200 a year: all of it is sold in month 1, to the last unit,
    # so month 2 is the first that starts with nothing.
    rng = np.random.default_rng(9)
    held = Lots(rng.uniform(0.1, 300, (120, 1)), rng.uniform(0, 200, (120, 1)))
    result = run(Plan(0.0, rule=Rule.PERCENT, percent=12.0), growing(3, 0.07), lots=held)
    assert result.balance[1:] == pytest.approx(0.0, abs=0.0)
    assert result.depleted == 2


def test_too_many_deposits_are_not_handed_over() -> None:
    path = growing(2, 0.0)
    lot = Lot(0, "A", 0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0)
    with pytest.raises(PlanError, match="more than 2000 deposits"):
        handover([lot] * 2001, path, 0.0)


# ---------------------------------------------------------------- an independent scalar model


def some_lots(seed: int, path: Grid, count: int = 5) -> Lots:
    rng = np.random.default_rng(seed + 50)
    assets = path.unit.shape[1]
    units = rng.uniform(20, 400, (count, assets)) / path.unit[0] * 300
    cost = units * path.unit[0] * rng.uniform(0.2, 1.4, (count, assets))
    return Lots(units, cost / path.level[0])


def golden(  # noqa: PLR0912, PLR0915 - one plain loop, as the engine's docstring reads
    plan: Plan, path: Grid, held: Lots, apartment: Home | None
) -> dict[str, list[float]]:
    """The plan with plain floats and lists of lots; every fraction found by bisection."""
    months, assets = path.unit.shape
    total = sum(plan.weights)
    shares = [w / total for w in plan.weights]
    book = [[list(held.units[j]), list(held.basis[j])] for j in range(len(held.units))]
    carried, debt = 0.0, 0.0
    rate = 1 - (1 - plan.management) ** (1 / 12)
    owned = apartment is not None
    out: dict[str, list[float]] = {k: [0.0] for k in ("sold", "tax", "fee", "net", "invested")}

    def value_at(k: int) -> float:
        return sum(lot[0][a] * path.unit[k, a] for lot in book for a in range(assets))

    out["balance"] = [value_at(0)]

    def sale(f: float, k: int) -> tuple[float, list[list[float]]]:
        """The cost (indexed to k) of selling ``f`` of every asset, and each lot's share sold."""
        cost, taken = 0.0, [[0.0] * assets for _ in book]
        for a in range(assets):
            left = f * sum(lot[0][a] for lot in book)
            for j, lot in enumerate(book):
                units = min(lot[0][a], left)
                left -= units
                if lot[0][a] > 0:
                    taken[j][a] = units / lot[0][a]
                    cost += lot[1][a] * taken[j][a] * path.level[k, a]
        return cost, taken

    for k in range(1, months):
        for lot in book:
            for a in range(assets):
                lot[1][a] += lot[0][a] * path.reinvested[k, a]
        value = value_at(k)
        proceeds = value * (1 - plan.sell)
        fee_due = min(value, value * rate + plan.monthly_fee)
        due = plan.amount * (path.cpi[k] / path.cpi[0] if plan.indexed else 1.0)
        due = due if plan.rule is Rule.FIXED else 0.0
        cash = float(apartment.cash[k]) if apartment is not None and owned else 0.0
        invested, owed = 0.0, debt

        def leaves(f: float) -> float:
            cost, _ = sale(f, k)  # noqa: B023 - used inside the month
            return f * proceeds - plan.gains_tax * max(f * proceeds - cost - carried, 0.0)  # noqa: B023

        def fraction_for(need: float) -> float:
            if need <= 0 or value <= 0:  # noqa: B023
                return 0.0
            if leaves(1.0) <= need:
                return 1.0
            low, high = 0.0, 1.0
            for _ in range(200):
                middle = (low + high) / 2
                low, high = (middle, high) if leaves(middle) < need else (low, middle)
            return high

        def buy(money: float) -> None:
            book.append(
                [
                    [money * s / ((1 + plan.buy) * path.unit[k, a]) for a, s in enumerate(shares)],  # noqa: B023
                    [money * s / path.level[k, a] for a, s in enumerate(shares)],  # noqa: B023
                ]
            )

        if apartment is not None and owned:
            duty = fee_due - cash
            everything = leaves(1.0)
            planned = apartment.role is Sale.ON_DATE and k == apartment.sell_on
            forced = duty > 0 and everything < duty - 0.005
            empty = apartment.role is Sale.WHEN_EMPTY and everything < due + duty - 0.005
            if planned or forced or empty:
                owned = False
                worth = float(apartment.worth[k])
                if worth > 0:
                    buy(worth)
                    invested += worth
                    value = value_at(k)
                    proceeds = value * (1 - plan.sell)
                    fee_due = min(value, value * rate + plan.monthly_fee)
                else:
                    owed += -worth
        duty = fee_due - cash + owed
        if plan.rule is Rule.FIXED:
            fraction = fraction_for(due + duty)
        else:
            fraction = max(min(plan.percent / 12, 1.0), fraction_for(duty)) if value > 0 else 0.0
        if (1 - fraction) * value < 0.005:
            fraction = 1.0 if value > 0 else 0.0
        cost, taken = sale(fraction, k)
        gain = fraction * proceeds - cost
        tax = plan.gains_tax * max(gain - carried, 0.0)
        carried = max(carried - gain, 0.0)
        for j, lot in enumerate(book):
            for a in range(assets):
                lot[0][a] *= 1 - taken[j][a]
                lot[1][a] *= 1 - taken[j][a]
        available = fraction * proceeds - tax + cash - owed
        debt = -available if available < -0.005 else 0.0
        fee = min(fee_due, max(available, 0.0))
        rest = available - fee
        if plan.rule is Rule.FIXED:
            net = min(max(rest, 0.0), due)
            if rest - due > 0.005:
                buy(rest - due)
                invested += rest - due
        else:
            net = max(rest, 0.0)
        out["sold"].append(fraction * value)
        out["tax"].append(tax)
        out["fee"].append(fee)
        out["net"].append(net)
        out["invested"].append(invested)
        out["balance"].append(value_at(k))
    return out


@pytest.mark.parametrize("seed", [1, 2, 3])
@pytest.mark.parametrize("plan", PLANS)
@pytest.mark.parametrize("role", [None, Sale.KEPT, Sale.ON_DATE, Sale.WHEN_EMPTY])
def test_the_engine_is_the_scalar_model(plan: Plan, role: Sale | None, seed: int) -> None:
    path = world(seed, months=30)
    held = some_lots(seed, path)
    apartment = None
    if role is not None:
        cash, worth = flows(seed, months=30)
        apartment = Home(cash, worth, role, 14)
    result = run(plan, path, apartment, lots=held)
    for key, values in golden(plan, path, held, apartment).items():
        assert getattr(result, key) == pytest.approx(values, rel=1e-9, abs=1e-5), key


def test_a_batch_with_lots_is_its_realizations_one_by_one() -> None:
    seeds = [1, 2, 3]
    paths = [world(seed, months=30) for seed in seeds]
    held = [some_lots(seed, path) for seed, path in zip(seeds, paths, strict=True)]
    homes = [Home(*flows(seed, months=30), Sale.WHEN_EMPTY) for seed in seeds]
    batch = Lots(np.stack([h.units for h in held]), np.stack([h.basis for h in held]))
    many = run_many(PLANS[0], stack(paths), stack_homes(homes), batch)
    for i, path in enumerate(paths):
        one = run(PLANS[0], path, homes[i], lots=held[i])
        for key in FIELDS:
            assert getattr(many, key)[i] == pytest.approx(getattr(one, key), rel=1e-12), key


# ---------------------------------------------------------------- the handover from the Market tab


@pytest.mark.parametrize("base", [TaxBase.NOMINAL, TaxBase.REAL])
def test_the_handover_is_the_market_tabs_account(base: TaxBase) -> None:
    # Three deposits into an asset with dividends, a buy and a sell commission, handed over on
    # 2022-01-03 and held a year with nothing withdrawn: selling everything then leaves what the
    # Market tab's account leaves for the same deposits sold on that day.
    taxes = Taxes(gains=0.25, dividend=0.25, base=base)
    fees = Fees(buy=0.002, sell=0.005)
    cpi = CpiPath(
        np.array([day_number(date(2019, 12, 1)), day_number(date(2023, 6, 1))]),
        np.array([100.0, 112.0]),
    )
    held = asset(dividends=True, seed=3)
    deposits = [
        Deposit(date(2020, 1, 1), 100_000),
        Deposit(date(2020, 7, 1), 50_000),
        Deposit(date(2021, 1, 4), 80_000),
    ]
    day = date(2022, 1, 3)
    at_handover = run_market([held], deposits, day, fees=fees, taxes=taxes, cpi=cpi)
    # A year of month dates from the handover ends on 2023-01-03, a day the asset has a bar for.
    whole = run_market([held], deposits, date(2023, 1, 3), fees=fees, taxes=taxes, cpi=cpi)
    path = sample([held], day, 12, taxes, cpi)
    bought = handover(at_handover.lots, path, fees.sell)
    assert bought.units.shape == (3, 1)
    nothing = Plan(0.0, rule=Rule.PERCENT, percent=0.0, sell=fees.sell, buy=fees.buy)
    result = run(nothing, path, lots=bought)
    assert result.balance[0] == pytest.approx(at_handover.value)
    assert result.balance[-1] == pytest.approx(whole.value)
    assert result.liquidation == pytest.approx(whole.net_value)
    # Sold on the handover day itself, the tax is the Market tab's own.
    cost = float(bought.basis[:, 0] @ np.ones(3)) * path.level[0, 0]
    assert at_handover.value * (1 - fees.sell) - cost == pytest.approx(at_handover.taxable_gain)


def test_a_handover_on_a_weekend_reads_the_bar_the_account_was_valued_on() -> None:
    # The plan ends on Saturday 2022-01-01: its account is valued on Friday's bar. The grid's
    # first day reads that bar too, so the move to Monday is not lost (or won) at the handover.
    held = asset(dividends=True, seed=3)
    deposits = [Deposit(date(2020, 1, 1), 100_000), Deposit(date(2021, 1, 4), 80_000)]
    cpi = CpiPath(
        np.array([day_number(date(2019, 12, 1)), day_number(date(2023, 6, 1))]),
        np.array([100.0, 100.0]),
    )
    day = date(2022, 1, 1)
    at_handover = run_market([held], deposits, day, cpi=cpi)
    # Month 12 is Sunday 2023-01-01: both sell on the Monday after it.
    whole = run_market([held], deposits, date(2023, 1, 2), cpi=cpi)
    path = sample([held], day, 12, Taxes(), cpi, handed=True)
    result = run(
        Plan(0.0, rule=Rule.PERCENT, percent=0.0), path, lots=handover(at_handover.lots, path, 0.0)
    )
    assert result.balance[0] == pytest.approx(at_handover.value)
    assert result.balance[-1] == pytest.approx(whole.value)
    assert result.liquidation == pytest.approx(whole.net_value)
