"""A scenario in simulated worlds: answers known in advance, and the risks along a path."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import numpy as np
import pytest

from app.planner.deposits import Deposit, Recurring, add_months, day_number
from app.planner.home import HomeSeries
from app.planner.inflation import assumed_cpi
from app.planner.market import AssetData, PlanError, Taxes
from app.planner.paths import make_world
from app.planner.scenario import Account, Side, run_pair
from app.planner.scenario_data import (
    Change,
    OptionSpec,
    ScenarioSpec,
    estimate_market,
    history_panel,
    run,
    world_spec,
)
from app.planner.study import outcome
from tests.unit.planner.test_scenario import END, FLAT_CPI, account
from tests.unit.planner.test_scenario import home as owner
from tests.unit.planner.test_scenario_data import MACRO, START, home, scenario

HISTORICAL = {"value_mode": "historical", "rates_mode": "historical"}

# ---------------------------------------------------------------- known answers


def test_a_modelled_market_without_volatility_is_a_constant_return() -> None:
    spec = scenario()
    worlds = world_spec(spec, MACRO, market=(0.06, 0.0))
    assert worlds.panel is None  # nothing is resampled: every series is modelled
    assert worlds.months == 120
    got = run(spec, MACRO, Change(world=make_world(worlds, 0)))
    want = run(spec, MACRO, Change(market_return=0.06))
    # Months against calendar days: the two growths agree to a few days' worth.
    assert got.y.xirr == pytest.approx(0.06, abs=2e-4)
    assert got.y.wealth == pytest.approx(want.y.wealth, rel=2e-3)
    assert got.x.home is not None
    assert want.x.home is not None
    assert got.x.home.value == pytest.approx(want.x.home.value, rel=1e-12)
    assert got.x.home.payment == pytest.approx(want.x.home.payment, rel=1e-12)
    # Without any volatility every world is the same world.
    again = run(spec, MACRO, Change(world=make_world(worlds, 7)))
    assert (again.x.wealth, again.y.wealth) == (got.x.wealth, got.y.wealth)


def monthly_asset(months: int) -> AssetData:
    """A bar on the first of each month from 2010: a price, dividends and a shekel rate."""
    rng = np.random.default_rng(11)
    days = np.array([day_number(add_months(date(2010, 1, 1), k)) for k in range(months + 1)])
    close = 50.0 * np.exp(np.cumsum(rng.normal(0.005, 0.04, months + 1)))
    paid = np.where(np.arange(months + 1) % 3 == 0, 1.01, 1.0)
    factor = np.cumprod(paid) / np.prod(paid)
    fx = 3.6 * np.exp(np.cumsum(rng.normal(0.0, 0.01, months + 1)))
    return AssetData("AAA", 1.0, days, close, close, close, close, factor, fx)


def test_history_in_its_own_order_is_reproduced() -> None:
    # One block as long as the history, so the world is the history itself.
    mix = Account([monthly_asset(36)], taxes=Taxes(gains=0.25, dividend=0.25))
    saver = OptionSpec(account=mix, recurring=[Recurring(date(2010, 1, 1), 1_000.0, count=36)])
    spec = ScenarioSpec(saver, OptionSpec(), date(2013, 1, 1))
    worlds = world_spec(spec, MACRO, block=36)
    assert worlds.panel is not None
    assert (len(worlds.panel), worlds.months) == (36, 36)
    got = run(spec, MACRO, Change(world=make_world(worlds, 5)))
    want = run(spec, MACRO)
    assert got.x.wealth == pytest.approx(want.x.wealth, rel=1e-9)
    assert got.x.market is not None
    assert want.x.market is not None
    assert got.x.market.dividend_tax == pytest.approx(want.x.market.dividend_tax, rel=1e-9)
    assert got.x.market.tax == pytest.approx(want.x.market.tax, rel=1e-9)


def test_the_same_seed_gives_the_same_worlds_and_another_seed_others() -> None:
    spec = scenario(**HISTORICAL)

    def wealth(seed: int, index: int) -> tuple[float, float]:
        result = run(
            spec, MACRO, Change(world=make_world(world_spec(spec, MACRO, seed=seed), index))
        )
        return result.x.wealth, result.y.wealth

    assert wealth(1, 3) == wealth(1, 3)
    assert wealth(1, 3) != wealth(1, 4)
    assert wealth(1, 3) != wealth(2, 3)


# ---------------------------------------------------------------- what a world carries


def test_the_panel_holds_what_the_scenario_resamples() -> None:
    spec = scenario(**HISTORICAL)
    panel = history_panel(spec, MACRO, assets=True)
    assert panel is not None
    # The market asset starts in January 2000, the macro series end in June 2026.
    assert (panel.months[0], panel.months[-1]) == (
        day_number(date(2000, 2, 1)),
        day_number(date(2026, 6, 1)),
    )
    assert sorted(panel.ratios) == ["RETURN/close", "RETURN/factor", "RETURN/fx", "dwelling"]
    assert panel.ratios["dwelling"] == pytest.approx(np.full(len(panel), 1.004))
    assert panel.rate is not None
    assert (panel.rate[0], panel.rate[-1]) == (0.10, 0.0025)
    assert history_panel(scenario(), MACRO, assets=False) is None
    young = Account([monthly_asset(12)])
    with pytest.raises(PlanError, match="share 12 months of history"):
        history_panel(
            ScenarioSpec(OptionSpec(account=young), OptionSpec(), END), MACRO, assets=True
        )


def test_the_market_model_is_estimated_from_the_mix() -> None:
    mean, sd = estimate_market(scenario())  # an asset that grows by 6 % a year, every day
    assert mean == pytest.approx(0.06, abs=1e-3)
    assert sd < 1e-3  # only the months' different lengths
    with pytest.raises(PlanError, match="needs an asset mix"):
        estimate_market(ScenarioSpec(OptionSpec(home=home()), OptionSpec(), END))


def test_a_modelled_apartment_can_move_with_a_modelled_market() -> None:
    spec = scenario(value_mean=0.06, value_sd=0.2)

    def paths(correlation: float) -> tuple[np.ndarray, np.ndarray]:
        worlds = world_spec(spec, MACRO, market=(0.06, 0.2), correlation=correlation)
        world = make_world(worlds, 0)
        result = run(spec, MACRO, Change(world=world))
        assert result.x.home is not None
        assert world.market is not None
        at = np.searchsorted(world.market.days, world.days)
        return result.x.home.value / 1_500_000, world.market.close[at]

    value, market = paths(1.0)
    assert value == pytest.approx(market, rel=1e-9)  # the same parameters and the same shocks
    value, market = paths(0.0)
    steps = np.corrcoef(np.diff(np.log(value)), np.diff(np.log(market)))[0, 1]
    assert abs(steps) < 0.3


def test_the_rate_of_a_world_reaches_the_tracks() -> None:
    spec = scenario(**HISTORICAL)
    worlds = world_spec(spec, MACRO)
    assert worlds.rate_now == 0.0025  # the last published rate of the test series
    world = make_world(worlds, 0)
    assert world.rate is not None
    result = run(spec, MACRO, Change(world=world))
    assert result.x.home is not None
    fixed, linked, prime = (s.rate for s in result.x.home.schedules)
    # The fixed track moves by the world's rate on the purchase day less today's; the linked
    # one stays; prime is the world's rate of each month plus 1.5 % and the spread.
    assert fixed[0] == pytest.approx(0.05 + world.rate[0] - 0.0025)
    assert linked[0] == 0.03
    assert prime[:120] == pytest.approx(world.rate[:120] + 0.015 - 0.005)
    entered = run(spec, MACRO, Change(world=world, follow_rates=False))
    assert entered.x.home is not None
    assert entered.x.home.schedules[0].rate[0] == 0.05


# ---------------------------------------------------------------- the risks along a path


def test_an_apartment_below_its_loan_is_negative_equity() -> None:
    side = owner(equity=50_000)
    assert side.home is not None
    fallen = HomeSeries(
        np.concatenate(([1.0], np.full(240, 0.5))), np.ones(241), np.full(241, 0.04), np.ones(241)
    )
    result = run_pair(Side(home=side.home, series=fallen), Side(account=account()), END, FLAT_CPI)
    sunk = outcome(result, FLAT_CPI)
    assert (sunk.x.negative_equity, sunk.y.negative_equity) == (True, None)
    assert sunk.x.drawdown == pytest.approx(1.0)  # no equity left: the whole peak is gone
    safe = outcome(run_pair(owner(), Side(account=account()), END, FLAT_CPI), FLAT_CPI)
    assert (safe.x.negative_equity, safe.x.drawdown) == (False, 0.0)


def test_payment_stress_is_the_highest_payment_over_the_income_of_its_month() -> None:
    result = run_pair(owner(), Side(account=account()), END, FLAT_CPI)
    assert outcome(result, FLAT_CPI).x.stress is None  # no income given
    assert outcome(result, FLAT_CPI, income=10_000.0).x.stress == pytest.approx(0.25)
    assert outcome(result, FLAT_CPI, income=10_000.0).y.stress is None
    # The income rises with the CPI and this payment does not: the first month is the worst.
    cpi = assumed_cpi(day_number(START) - 3_000, day_number(END), mu=0.03)
    rising = outcome(result, cpi, income=10_000.0).x.stress
    assert rising == pytest.approx(0.25 / 1.03 ** (1 / 12), rel=1e-3)


def test_time_under_water_and_the_drawdown_of_an_account() -> None:
    def mirror(rate: float) -> tuple[float | None, float]:
        result = run_pair(owner(), Side(account=account(rate)), END, FLAT_CPI)
        side = outcome(result, FLAT_CPI).y
        return side.under_water, side.drawdown

    assert mirror(0.05) == (0.0, 0.0)  # always above its deposits, never below a peak
    assert mirror(-0.05)[0] == 1.0  # always below them
    # A single deposit in a price that doubles and then halves twice: half its peak is lost.
    rise = account(0.0)
    asset = rise.assets[0]
    close = np.where(asset.days < asset.days[0] + 200, 2.0, 0.5)
    close[0] = 1.0
    jumpy = Account(
        [replace(asset, close=close, open=close, high=close, low=close)], taxes=rise.taxes
    )
    saver = Side(account=jumpy, deposits=[Deposit(date(2020, 1, 15), 1_000.0)])
    result = run_pair(saver, Side(), END, FLAT_CPI)
    assert outcome(result, FLAT_CPI).x.drawdown == pytest.approx(0.75)


def test_yearly_returns_charge_the_purchase_costs_to_the_first_year() -> None:
    # A constant value and a 0 % loan earn nothing: 2,500 of principal a month is money put in.
    plain = outcome(run_pair(owner(), Side(account=account()), END, FLAT_CPI), FLAT_CPI)
    assert plain.x.returns == pytest.approx([0.0, 0.0], abs=1e-12)
    assert plain.y.returns == pytest.approx([0.0, 0.0], abs=1e-9)
    assert plain.spent == pytest.approx(400_000 + 23 * 2_500)
    # A lawyer at 1 % of the price: 10,000 gone in the first year, on 410,000 and half the year's.
    costly = outcome(run_pair(owner(lawyer=0.01), Side(account=account()), END, FLAT_CPI), FLAT_CPI)
    assert costly.x.returns == pytest.approx([-10_000 / (410_000 + 15_000), 0.0], abs=1e-12)
