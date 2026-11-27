"""Many realizations of a withdrawal plan (J2): a batch against batches of one, and the
numbers a study reports, by hand."""

from __future__ import annotations

import numpy as np
import pytest

from app.planner.withdraw import Grid, Home, Plan, Rule, Sale, run, run_many
from app.planner.withdraw_study import (
    income_fan,
    left,
    reverse,
    stack,
    stack_homes,
    start_worth,
    survival,
    sustainable,
)
from tests.unit.planner.test_withdraw import grid, growing, world
from tests.unit.planner.test_withdraw_home import PLANS, flows, home

FIELDS = (
    "balance", "sold", "commission", "tax", "fee", "net", "due", "home", "home_cash", "invested",
)  # fmt: skip


@pytest.mark.parametrize("plan", PLANS)
@pytest.mark.parametrize(
    ("role", "sell_on"), [(None, 0), (Sale.KEPT, 0), (Sale.ON_DATE, 20), (Sale.WHEN_EMPTY, 0)]
)
def test_a_batch_is_its_realizations_one_by_one(
    plan: Plan, role: Sale | None, sell_on: int
) -> None:
    seeds = [1, 2, 3, 4, 5]
    paths = [world(seed) for seed in seeds]
    homes = None if role is None else [Home(*flows(seed), role, sell_on) for seed in seeds]
    many = run_many(plan, stack(paths), None if homes is None else stack_homes(homes))
    for i, path in enumerate(paths):
        one = run(plan, path, None if homes is None else homes[i])
        for key in FIELDS:
            assert getattr(many, key)[i] == pytest.approx(getattr(one, key), rel=1e-12), key
        assert many.liquidation[i] == pytest.approx(one.liquidation, rel=1e-12)
        assert (many.depleted[i] or None) == one.depleted
        assert (many.home_sold[i] or None) == one.home_sold
        assert (many.short[i], many.first_short[i] or None) == (one.short, one.first_short)
        assert many.cause[i] == ("" if one.cause is None else one.cause)


def test_what_is_left_and_what_there_was() -> None:
    # Without an apartment: the balance against the capital.
    plan = Plan(1_000_000, cost_share=0.5, amount=10_000, indexed=False)
    paths = stack([growing(12, 0.0), growing(12, 0.10)])
    many = run_many(plan, paths)
    assert start_worth(plan, None, 2) == pytest.approx([1_000_000, 1_000_000])
    assert left(many, None) == pytest.approx(many.balance[:, -1])
    # With one: what selling both would leave, against the same on the first day.
    homes = stack_homes([home(12, worth=500_000.0), home(12, worth=700_000.0)])
    both = run_many(plan, paths, homes)
    first = 1_000_000 - 0.25 * 500_000
    assert start_worth(plan, homes, 2) == pytest.approx([first + 500_000, first + 700_000])
    assert left(both, homes) == pytest.approx(both.liquidation)


def test_the_share_still_paying_by_year() -> None:
    # Of four realizations one never runs out, and the others do in months 5, 12 and 13.
    depleted = np.array([0, 5, 12, 13])
    assert survival(depleted, 36) == pytest.approx([1.0, 0.5, 0.25, 0.25])
    # A plan that is not whole years ends on its last month.
    assert survival(depleted, 30).tolist() == [1.0, 0.5, 0.25, 0.25]
    assert survival(np.array([0, 0]), 12).tolist() == [1.0, 1.0]


def test_the_income_by_year_as_percentiles() -> None:
    # Five realizations paying 1..5 thousand a month in year one, twice that in year two.
    net = np.zeros((5, 25))
    net[:, 1:13] = np.arange(1, 6)[:, None] * 1_000
    net[:, 13:] = np.arange(1, 6)[:, None] * 2_000
    fan = income_fan(net, np.ones((5, 25)))
    assert fan.shape == (2, 5)
    assert fan[0] == pytest.approx([1_200, 2_000, 3_000, 4_000, 4_800])
    assert fan[1] == pytest.approx(2 * fan[0])
    # In shekels of the first day: prices that doubled halve it.
    assert income_fan(net, np.full((5, 25), 2.0))[0] == pytest.approx(fan[0] / 2)


def test_the_sustainable_amount_by_hand() -> None:
    # 1,200,000 that does not grow lasts 120 months at 10,000; halved on the first month, at
    # 5,000. So every realization lasts at 5,000, and half of them at 10,000.
    plan = Plan(1_200_000, cost_share=1.0, amount=1.0, indexed=False)
    flat = growing(120, 0.0)
    halved = grid([1.0, *([0.5] * 120)])
    paths = stack([flat, halved])
    assert sustainable(plan, paths, None, 1.0) == pytest.approx(5_000, abs=1)
    assert sustainable(plan, paths, None, 0.5) == pytest.approx(10_000, abs=1)
    # With an apartment sold when the account runs out, its 600,000 pays too.
    homes = stack_homes([home(120, worth=600_000.0, role=Sale.WHEN_EMPTY)] * 2)
    assert sustainable(plan, paths, homes, 0.5) == pytest.approx(15_000, abs=1)
    # 0.55 of twenty is eleven (a float says 11.000000000000002): eleven that last are enough.
    twenty = stack([flat] * 11 + [halved] * 9)
    assert sustainable(plan, twenty, None, 0.55) == pytest.approx(10_000, abs=1)
    # A percent rule has no amount to look for.
    with pytest.raises(ValueError, match="fixed"):
        sustainable(Plan(1.0, rule=Rule.PERCENT, percent=0.04), paths, None, 0.9)


def test_the_months_in_reverse_order() -> None:
    path = world(3, months=24, assets=2)
    back = reverse(path)
    # The same months, last first: the same end, and reversing twice is the path itself.
    assert back.unit[0] == pytest.approx(path.unit[0])
    assert back.unit[-1] == pytest.approx(path.unit[-1])
    assert back.unit[1] / back.unit[0] == pytest.approx(path.unit[-1] / path.unit[-2])
    again = reverse(back)
    assert again.unit == pytest.approx(path.unit)
    assert again.reinvested == pytest.approx(path.reinvested)
    # The CPI and the cost's index stay as they were.
    assert back.cpi == pytest.approx(path.cpi)
    assert back.level == pytest.approx(path.level)
    # A percent rule ends with the same balance either way; a fixed amount does not.
    percent = Plan(500_000, (1, 1), 0.5, Rule.PERCENT, percent=0.05)
    assert run(percent, back).balance[-1] == pytest.approx(run(percent, path).balance[-1])
    fixed = Plan(500_000, (1, 1), 0.5, Rule.FIXED, 6_000, False)
    assert run(fixed, back).balance[-1] != pytest.approx(run(fixed, path).balance[-1], rel=1e-6)


def test_reversed_dividends_keep_their_share_of_the_value() -> None:
    # A unit worth 1, 2, 4 that reinvested 0.1 and 0.4 (5 % and 10 % of its value then).
    path = grid([1.0, 2.0, 4.0], reinvested=[0.0, 0.1, 0.4])
    back = reverse(path)
    assert back.unit[:, 0] == pytest.approx([1.0, 2.0, 4.0])
    assert back.reinvested[:, 0] == pytest.approx([0.0, 0.2, 0.2])


def test_stacking_checks_the_shapes() -> None:
    with pytest.raises(ValueError, match="same"):
        stack([growing(12, 0.0), growing(13, 0.0)])
    one: Grid = stack([growing(12, 0.0)])
    assert one.unit.shape == (1, 13, 1)
