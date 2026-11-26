"""Layer 3 of the comparison metrics: what the answer depends on, against hand answers."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import numpy as np
import pytest

from app.planner.explain import (
    COMPONENTS,
    decompose,
    forced_sale,
    home_return,
    lead,
    shapley,
    without,
    yearly_correlation,
)
from app.planner.home import Betterment, Bracket, HomePlan, HomeSeries, RentMode, run_home
from app.planner.mortgage import Track
from app.planner.risk import split

START = date(2020, 1, 15)
EVERYTHING = frozenset(COMPONENTS)


def flat(months: int, growth: float = 0.0) -> HomeSeries:
    ones = np.ones(241)
    value = (1.0 + growth) ** (np.arange(241) / 12.0)
    return HomeSeries(value, ones, np.full(241, 0.04), ones[: months + 1])


def outright(growth: float = 0.03) -> tuple[HomePlan, HomeSeries]:
    """An apartment paid in full, with no costs, rent or tax."""
    plan = HomePlan(
        start=START,
        months=120,
        price=1_000_000,
        equity=1_000_000,
        tracks=[],
        betterment=Betterment(rate=0.0),
    )
    return plan, flat(120, growth)


def mortgaged() -> tuple[HomePlan, HomeSeries]:
    """A leveraged apartment with every kind of cost, rented out."""
    plan = HomePlan(
        start=START,
        months=120,
        price=1_500_000,
        equity=500_000,
        tracks=[Track(600_000, 240, rate=0.045), Track(400_000, 180, rate=0.03, linked=True)],
        purchase_tax=(Bracket(None, 0.05),),
        lawyer=0.006,
        broker=0.02,
        renovation=20_000.0,
        maintenance=0.005,
        insurance=1_500.0,
        rent_mode=RentMode.RENT_OUT,
        rent=4_500.0,
        vacancy=0.04,
        rent_tax=0.1,
        selling=0.02,
        early_repayment=0.005,
        betterment=Betterment(rate=0.25),
    )
    return plan, flat(120, 0.04)


# ---------------------------------------------------------------- the decomposition


def test_shapley_shares_a_hand_game_and_adds_up() -> None:
    worth: dict[frozenset[str], float] = {
        frozenset[str](): 0.0,
        frozenset("a"): 1.0,
        frozenset("b"): 2.0,
        frozenset("ab"): 4.0,
    }
    shares = shapley(worth.__getitem__, ("a", "b"))
    # a adds 1 when it comes first and 2 when it comes second: 1.5 on average; b, 2 and 3.
    assert shares == pytest.approx({"a": 1.5, "b": 2.5})
    alone = shapley(lambda on: 7.0 * ("a" in on), ("a", "b", "c"))
    assert alone == pytest.approx({"a": 7.0, "b": 0.0, "c": 0.0})


def test_switching_a_component_off_removes_only_it() -> None:
    plan, series = mortgaged()
    cash, _ = without(plan, series, frozenset({"leverage"}))
    assert (cash.equity, list(cash.tracks)) == (plan.price, [])
    free, _ = without(plan, series, frozenset({"costs"}))
    costs = (
        free.lawyer,
        free.broker,
        free.renovation,
        free.maintenance,
        free.insurance,
        free.selling,
        free.early_repayment,
        free.vacancy,
        free.rent_tax,
        free.betterment.rate,
    )
    assert costs == (0.0,) * 10
    assert tuple(free.purchase_tax) == ()
    assert without(plan, series, frozenset({"rent"}))[0].rent_mode is RentMode.NONE
    _, still = without(plan, series, frozenset({"appreciation"}))
    assert np.all(still.value == 1.0)
    assert np.array_equal(still.cpi, series.cpi)
    same_plan, same_series = without(plan, series, frozenset())
    assert (same_plan, same_series.value is series.value) == (plan, True)


def test_with_everything_off_an_apartment_earns_nothing() -> None:
    for plan, series in (outright(), mortgaged()):
        assert home_return(*without(plan, series, EVERYTHING)) == pytest.approx(0.0, abs=1e-9)


def test_an_apartment_bought_outright_earns_its_appreciation_only() -> None:
    parts = decompose(*outright(0.03))
    assert parts is not None
    # Months against calendar days: ten years of 3 % are 3 % a year to a few days' worth.
    assert parts["appreciation"] == pytest.approx(0.03, abs=1e-4)
    assert (parts["rent"], parts["leverage"], parts["costs"]) == pytest.approx((0, 0, 0), abs=1e-12)
    assert parts["total"] == pytest.approx(parts["appreciation"], abs=1e-12)


def test_the_four_contributions_add_up_to_the_apartments_return() -> None:
    plan, series = mortgaged()
    parts = decompose(plan, series)
    assert parts is not None
    assert sum(parts[name] for name in COMPONENTS) == pytest.approx(parts["total"], abs=1e-12)
    assert parts["total"] == pytest.approx(run_home(plan, series).xirr, abs=1e-12)
    # Rent received and a value that rises add; costs and taxes take away. The mortgage's
    # share has no sure sign: it is averaged over the orders in which the apartment does not
    # yet earn its rent or its appreciation, and there a loan only costs.
    assert parts["appreciation"] > 0
    assert parts["rent"] > 0
    assert parts["costs"] < 0
    # Without a rent there is nothing for the rent to add.
    quiet = decompose(replace(plan, rent_mode=RentMode.NONE), series)
    assert quiet is not None
    assert quiet["rent"] == pytest.approx(0.0, abs=1e-12)


def test_a_rent_that_follows_the_value_stops_with_the_appreciation() -> None:
    plan, series = outright(0.05)
    let = replace(plan, rent_mode=RentMode.RENT_OUT, rent=3_000.0)
    following = replace(series, rent=series.value[:121])  # as home_series makes it
    _, still = without(let, following, frozenset({"appreciation"}))
    assert np.all(still.rent == 1.0)
    # Its own index (here: flat) is kept as it is.
    assert without(let, series, frozenset({"appreciation"}))[1].rent is series.rent
    # With only the rent on, the two apartments are the same one: a rent at its first level.
    rent_only = EVERYTHING - {"rent"}
    assert home_return(*without(let, following, rent_only)) == home_return(
        *without(let, series, rent_only)
    )
    flat_rent, rising_rent = decompose(let, series), decompose(let, following)
    assert flat_rent is not None
    assert rising_rent is not None
    # The rise of the rent exists only with the appreciation on: the two share it.
    assert rising_rent["rent"] > flat_rent["rent"]
    assert rising_rent["appreciation"] > flat_rent["appreciation"]
    assert sum(rising_rent[name] for name in COMPONENTS) == pytest.approx(
        rising_rent["total"], abs=1e-12
    )


def test_no_decomposition_of_a_return_that_does_not_exist() -> None:
    # Nothing down, and the rent covers the payment: money only ever comes in.
    plan = HomePlan(
        start=START,
        months=120,
        price=1_000_000,
        equity=0.0,
        tracks=[Track(1_000_000, 120, rate=0.03)],
        rent_mode=RentMode.RENT_OUT,
        rent=12_000.0,
        betterment=Betterment(rate=0.0),
    )
    assert home_return(plan, flat(120)) is None
    assert decompose(plan, flat(120)) is None


def test_an_apartment_that_ends_with_a_debt_returns_minus_everything() -> None:
    # 5 % of equity, and the value halves: the sale does not cover the loan.
    plan, series = mortgaged()
    thin = replace(
        plan, equity=75_000, tracks=[Track(1_425_000, 240, rate=0.045)], rent_mode=RentMode.NONE
    )
    fallen = replace(series, value=np.concatenate(([1.0], np.full(240, 0.5))))
    assert home_return(thin, fallen) == -1.0


# ---------------------------------------------------------------- a forced sale


def test_a_forced_sale_without_a_discount_is_the_sale() -> None:
    plan, series = mortgaged()
    result = run_home(plan, series)
    assert forced_sale(plan, series, result, 0.0) == pytest.approx(result.net_worth[-1], rel=1e-12)


def test_a_forced_sale_loses_the_discount_less_the_tax_it_saves() -> None:
    # Bought for a million in cash, sold when worth two: a real gain of a million, taxed 25 %.
    plan, _ = outright()
    plan = replace(plan, betterment=Betterment(rate=0.25))
    series = replace(flat(120), value=np.concatenate(([1.0], np.full(240, 2.0))))
    result = run_home(plan, series)
    assert result.net_worth[-1] == pytest.approx(2_000_000 - 250_000)
    # At 10 % off it sells for 1.8 million: the gain is 800,000 and its tax 200,000.
    assert forced_sale(plan, series, result, 0.10) == pytest.approx(1_800_000 - 200_000)
    untaxed = replace(plan, betterment=Betterment(rate=0.0))
    assert forced_sale(untaxed, series, run_home(untaxed, series), 0.25) == pytest.approx(1_500_000)


# ---------------------------------------------------------------- who leads, and from when


def test_the_lead_is_from_the_last_change_of_hands() -> None:
    months = [12, 24, 36, 48]
    swap = lead(months, np.array([1.0, 3.0, 2.0, 5.0]), np.array([2.0, 2.0, 3.0, 4.0]))
    assert (swap.leader, swap.since, swap.x_share) == ("x", 48, 0.5)
    late = lead(months, np.array([1.0, 1.0, 5.0, 5.0]), np.array([2.0, 2.0, 3.0, 4.0]))
    assert (late.leader, late.since, late.x_share) == ("x", 36, 0.5)
    always = lead(months, np.array([1.0, 1.0, 1.0, 1.0]), np.array([2.0, 2.0, 3.0, 4.0]))
    assert (always.leader, always.since, always.x_share) == ("y", 12, 0.0)


def test_a_tie_at_the_end_has_no_leader_and_counts_half() -> None:
    tied = lead([12, 24], np.array([3.0, 2.0]), np.array([1.0, 2.0]))
    assert (tied.leader, tied.since, tied.x_share) == (None, None, 0.75)


# ---------------------------------------------------------------- do the two move together


def yearly(returns: list[float]) -> np.ndarray:
    """Monthly growths whose years grow by ``returns`` (all of it in the year's first month)."""
    months = np.ones(12 * len(returns))
    months[::12] = 1.0 + np.array(returns)
    return months


def test_the_correlation_of_yearly_returns_by_hand() -> None:
    a = yearly([0.1, 0.2, 0.3, 0.4])
    b = yearly([0.2, 0.1, 0.4, 0.3])
    found = yearly_correlation(a, b)
    assert found is not None
    # Deviations (-.15, -.05, .05, .15) and (-.05, -.15, .15, .05): 0.03 over 0.05.
    assert (found.value, found.years) == (pytest.approx(0.6), 4)
    # Fisher's z with four years: atanh(0.6) -+ 1.96, a very wide interval.
    assert (found.low, found.high) == pytest.approx((-0.8529, 0.9901), abs=1e-4)
    same = yearly_correlation(a, a)
    assert same is not None
    assert (same.value, same.low, same.high) == pytest.approx((1.0, 1.0, 1.0))
    # Months beyond the last whole year are left out.
    assert yearly_correlation(np.append(a, 1.5), np.append(b, 0.5)) == found


def test_no_correlation_without_enough_years_or_without_movement() -> None:
    assert yearly_correlation(yearly([0.1, 0.2, 0.3]), yearly([0.2, 0.1, 0.4])) is None
    steady = np.full(60, 1.004)
    assert yearly_correlation(steady, yearly([0.1, 0.2, 0.3, 0.4, 0.5])) is None


# ---------------------------------------------------------------- the same money in both


def test_a_split_of_the_money_between_the_options() -> None:
    x, y = np.array([1.0, 2.0, 3.0, 4.0]), np.array([4.0, 3.0, 2.0, 1.0])
    rows = split(x, y, (0.0, 0.25, 0.5, 1.0))
    assert [row.weight for row in rows] == [0.0, 0.25, 0.5, 1.0]
    # All in one option is that option.
    assert (rows[0].p50, rows[-1].p50) == (2.5, 2.5)
    assert (rows[0].p5, rows[-1].p5) == pytest.approx((1.15, 1.15))
    assert (rows[0].cvar5, rows[-1].cvar5) == (1.0, 1.0)
    # A quarter in x: 3.25, 2.75, 2.25, 1.75.
    assert (rows[1].p50, rows[1].p5, rows[1].cvar5) == pytest.approx((2.5, 1.825, 1.75))
    # Half and half of two options that mirror each other is a sure 2.5.
    assert (rows[2].p50, rows[2].p5, rows[2].cvar5) == pytest.approx((2.5, 2.5, 2.5))


def test_splitting_between_identical_options_changes_nothing() -> None:
    x = np.array([5.0, 1.0, 9.0, 3.0])
    rows = split(x, x, (0.0, 0.5, 1.0))
    assert len({(row.p50, row.p5, row.cvar5) for row in rows}) == 1
