"""A scenario moved in time or changed in one input: what moves, what a window refuses."""

from __future__ import annotations

from dataclasses import replace
from datetime import date
from types import SimpleNamespace
from typing import cast

import numpy as np
import pytest

from app.macro.series import MacroSeries
from app.macro.service import CachedSeries
from app.planner.data import InflationSpec
from app.planner.deposits import Deposit, Recurring, add_months, day_number
from app.planner.fills import FillMode
from app.planner.home import Betterment, HomePlan, RentMode
from app.planner.home_data import HomeSpec
from app.planner.market import AssetData, FillSpec, PlanError, Taxes
from app.planner.mortgage import RateKind, Track
from app.planner.scenario import Account
from app.planner.scenario_data import (
    Change,
    OptionSpec,
    ScenarioSpec,
    build,
    difference,
    first_day,
    growing_asset,
    run,
    sensitivity,
    spending_gap,
    term_months,
)
from app.planner.study import breakeven

START = date(2010, 3, 15)
END_10 = date(2020, 3, 15)


def monthly(first: date, months: int, start: float, growth: float) -> MacroSeries:
    days = [day_number(add_months(first, k)) for k in range(months)]
    values = start * (1 + growth) ** np.arange(months, dtype=np.float64)
    return MacroSeries(np.array(days, dtype=np.int64), values)


class FakeMacro:
    """A dwelling index and a CPI from 1994 to 2026-06, and a Bank of Israel rate in steps."""

    def __init__(self) -> None:
        steps = {date(1994, 1, 27): 10.0, date(2005, 1, 1): 4.0, date(2015, 1, 1): 0.25}
        steps[date(2026, 6, 1)] = 0.25  # published daily: the last value is recent
        self.series = {
            "dwelling": monthly(date(1994, 1, 1), 390, 100.0, 0.004),
            "cpi": monthly(date(1994, 1, 1), 390, 50.0, 0.002),
            "boi_rate": MacroSeries(
                np.array([day_number(d) for d in steps]), np.array(list(steps.values()))
            ),
        }

    def get(self, series: str) -> CachedSeries:
        return cast("CachedSeries", SimpleNamespace(data=self.series[series]))


MACRO = FakeMacro()
MARKET = Account(
    [growing_asset(0.06, day_number(date(2000, 1, 3)), day_number(date(2026, 12, 31)))],
    taxes=Taxes(gains=0.0, dividend=0.0),
)


def home(months: int = 120, **spec: object) -> HomeSpec:
    plan = HomePlan(
        start=START,
        months=months,
        price=1_500_000,
        equity=600_000,
        tracks=[
            Track(300_000, 240, rate=0.05),
            Track(300_000, 240, rate=0.03, linked=True),
            Track(300_000, 240, kind=RateKind.PRIME, rate=-0.005),
        ],
        rent_mode=RentMode.LIVE,
        rent=4_000.0,
        betterment=Betterment(rate=0.25, linear=True),
    )
    return HomeSpec(plan=plan, **spec)  # type: ignore[arg-type]


def scenario(**spec: object) -> ScenarioSpec:
    return ScenarioSpec(
        OptionSpec(home=home(120, **spec)), OptionSpec(account=MARKET), add_months(START, 120)
    )


HISTORICAL = {"value_mode": "historical", "rates_mode": "historical"}

# ---------------------------------------------------------------- moving in time


def test_a_shift_moves_every_date_by_whole_months() -> None:
    spec = ScenarioSpec(
        OptionSpec(home=home()),
        OptionSpec(
            account=MARKET,
            one_off=[Deposit(date(2011, 1, 31), 500.0)],
            recurring=[Recurring(date(2012, 5, 20), 100.0, count=3)],
        ),
        add_months(START, 120),
    )
    assert (first_day(spec), term_months(spec)) == (START, 120)
    x, y, end, _, _ = build(spec, MACRO, Change(shift=-13))
    assert x.home is not None
    assert (x.home.start, x.home.months, end) == (date(2009, 2, 15), 120, date(2019, 2, 15))
    assert [d.day for d in y.deposits] == [
        date(2009, 12, 31), date(2011, 4, 20), date(2011, 5, 20), date(2011, 6, 20),
    ]  # fmt: skip


def test_another_horizon_moves_the_sale_and_drops_the_deposits_after_it() -> None:
    spec = ScenarioSpec(
        OptionSpec(home=home()),
        OptionSpec(account=MARKET, recurring=[Recurring(START, 100.0, count=120)]),
        add_months(START, 120),
    )
    x, y, end, _, _ = build(spec, MACRO, Change(months=36))
    assert x.home is not None
    assert (x.home.months, end) == (36, date(2013, 3, 15))
    assert len(y.deposits) == 36
    left_out = "Deposits on or after the day everything is sold are left out"
    assert build(spec, MACRO, Change(months=36))[4] == [left_out]
    assert build(spec, MACRO)[4] == []
    with pytest.raises(PlanError, match="at least a month"):
        build(spec, MACRO, Change(months=0))
    # Without an apartment the term runs from the first deposit to the end.
    alone = ScenarioSpec(spec.y, OptionSpec(), date(2015, 3, 15))
    assert term_months(alone) == 60
    assert build(alone, MACRO, Change(shift=2, months=24))[2] == date(2012, 5, 15)


# ---------------------------------------------------------------- a window of history


def test_a_window_moves_the_unlinked_rates_with_the_bank_of_israel() -> None:
    spec = scenario(**HISTORICAL)

    def rates(change: Change) -> list[float]:
        side = build(spec, MACRO, change)[0]
        assert side.home is not None
        return [t.rate for t in side.home.tracks]

    assert rates(Change()) == [0.05, 0.03, -0.005]
    # Bought in 2002 at a Bank of Israel rate of 10 %, against 0.25 % now (the rates entered
    # are today's quotes): the fixed track gets 9.75 % more; the linked one and the prime
    # spread stay.
    early = Change(shift=-96, historical=True)
    assert rates(early) == pytest.approx([0.1475, 0.03, -0.005])
    assert rates(Change(shift=-96, historical=True, follow_rates=False)) == [0.05, 0.03, -0.005]
    # The plan's own day (2010, 4 %) is a window like any other; one at today's rate is as entered.
    assert rates(Change(historical=True)) == pytest.approx([0.0875, 0.03, -0.005])
    assert rates(Change(shift=72, historical=True)) == pytest.approx([0.05, 0.03, -0.005])
    # An assumed rate path has no history to follow.
    assumed = scenario(value_mode="historical")
    side = build(assumed, MACRO, early)[0]
    assert side.home is not None
    assert side.home.tracks[0].rate == 0.05


def test_a_window_drops_the_linear_rule_of_the_betterment_tax() -> None:
    spec = scenario(**HISTORICAL)
    plain = build(spec, MACRO, Change())[0].home
    window = build(spec, MACRO, Change(historical=True))[0].home
    assert plain is not None
    assert window is not None
    assert (plain.betterment.linear, window.betterment.linear) == (True, False)
    # Bought in 2010 and sold in 2020: the rule would exempt the share of the days before 2014.
    taxed = run(spec, MACRO, Change(historical=True)).x.home
    exempt = run(spec, MACRO, Change()).x.home
    assert taxed is not None
    assert exempt is not None
    share = (date(2020, 3, 15) - date(2014, 1, 1)).days / (date(2020, 3, 15) - START).days
    assert exempt.betterment[-1] == pytest.approx(share * taxed.betterment[-1])


def test_a_window_refuses_data_that_is_not_there() -> None:
    spec = scenario(**HISTORICAL)
    assert run(spec, MACRO, Change(shift=75, historical=True)).end == date(2026, 6, 15)
    with pytest.raises(PlanError, match="Bank of Israel rate is published until 2026-06-01"):
        run(spec, MACRO, Change(shift=77, historical=True))
    with pytest.raises(PlanError, match="index 'dwelling' covers"):
        run(scenario(value_mode="historical"), MACRO, Change(shift=77, historical=True))
    with pytest.raises(PlanError, match="RETURN has no data before 2000-01-03"):
        run(spec, MACRO, Change(shift=-123, historical=True))
    # The actual CPI must reach the end too; one plan alone only warns and holds it flat.
    real = ScenarioSpec(
        OptionSpec(account=MARKET, one_off=[Deposit(START, 100.0)]),
        OptionSpec(),
        date(2020, 3, 15),
        InflationSpec("historical"),
    )
    assert run(real, MACRO, Change(shift=74, historical=True)).end == date(2026, 5, 15)
    with pytest.raises(PlanError, match="CPI is published until 2026-06-01"):
        run(real, MACRO, Change(shift=77, historical=True))
    flat = scenario(rates_mode="historical")
    late = ScenarioSpec(flat.x, flat.y, flat.end, InflationSpec("historical"))
    assert "After the last published CPI it is held flat" in build(late, MACRO, Change(shift=90))[4]


# ---------------------------------------------------------------- one input changed


def bought_outright() -> ScenarioSpec:
    """An apartment paid in full, with no costs, rent or tax, against the market."""
    plan = HomePlan(
        start=START,
        months=120,
        price=1_000_000,
        equity=1_000_000,
        tracks=[],
        betterment=Betterment(rate=0.0),
    )
    return ScenarioSpec(
        OptionSpec(home=HomeSpec(plan=plan, value_mean=0.02)),
        OptionSpec(account=MARKET),
        add_months(START, 120),
    )


def test_the_breakeven_appreciation_of_an_apartment_bought_outright_is_the_market_return() -> None:
    spec = bought_outright()
    # One payment on each side, growing at its own rate: equal when the rates are.
    rate = breakeven(lambda g: difference(spec, MACRO, Change(appreciation=g)), -0.2, 0.5)
    assert rate == pytest.approx(0.06, abs=1e-5)  # months against calendar days: not exact
    back = breakeven(lambda r: difference(spec, MACRO, Change(market_return=r)), -0.5, 1.0)
    assert back == pytest.approx(0.02, abs=1e-5)
    assert rate is not None
    assert difference(spec, MACRO, Change(appreciation=rate)) == pytest.approx(0.0, abs=0.01)


def test_the_rent_and_the_rates_change_only_what_they_name() -> None:
    spec = scenario()
    base = run(spec, MACRO).x.home
    doubled = run(spec, MACRO, Change(rent_scale=2.0)).x.home
    dearer = run(spec, MACRO, Change(rate_shift=0.01)).x.home
    assert base is not None
    assert doubled is not None
    assert dearer is not None
    assert doubled.rent == pytest.approx(2 * base.rent)
    assert doubled.payment == pytest.approx(base.payment)
    assert [s.rate[0] for s in dearer.schedules] == pytest.approx(
        [s.rate[0] + 0.01 for s in base.schedules]
    )
    # A higher rent is better for the owner, a higher rate worse.
    assert difference(spec, MACRO, Change(rent_scale=2.0)) > difference(spec, MACRO, Change())
    assert difference(spec, MACRO, Change(rate_shift=0.01)) < difference(spec, MACRO, Change())


def test_the_spending_gap_is_zero_when_one_option_covers_the_other() -> None:
    assert spending_gap(run(scenario(), MACRO)) == pytest.approx(0.0, abs=1e-6)
    apart = ScenarioSpec(
        OptionSpec(account=MARKET, one_off=[Deposit(date(2010, 3, 5), 1_000.0)]),
        OptionSpec(account=MARKET, one_off=[Deposit(date(2010, 3, 20), 1_000.0)]),
        date(2011, 3, 20),
    )
    assert spending_gap(run(apart, MACRO)) == pytest.approx(1_000.0)


def test_a_seeded_fill_draws_the_same_prices_in_every_run() -> None:
    days = np.arange(day_number(START) - 3, day_number(START) + 800, dtype=np.int64)
    close = 100.0 + 0.01 * np.arange(len(days), dtype=np.float64)
    ones = np.ones(len(days))
    asset = AssetData("ZZZ", 1.0, days, close, 1.05 * close, 0.95 * close, close, ones, ones)
    account = Account([asset], fill=FillSpec(FillMode.ESTIMATED))
    spec = ScenarioSpec(
        OptionSpec(account=account, recurring=[Recurring(START, 100.0, count=12)], fill_seed=7),
        OptionSpec(),
        add_months(START, 24),
    )
    first, second = run(spec, MACRO).x.wealth, run(spec, MACRO).x.wealth
    assert first == second
    unseeded = ScenarioSpec(
        OptionSpec(account=account, recurring=spec.x.recurring), spec.y, spec.end
    )
    assert run(unseeded, MACRO).x.wealth != first


# ---------------------------------------------------------------- one input moved


def test_a_move_of_nothing_is_the_plan_itself() -> None:
    spec = scenario(**HISTORICAL)
    base = run(spec, MACRO)
    still = run(spec, MACRO, Change(value_drift=0.0, market_drift=0.0, tax_shift=0.0))
    assert (still.x.wealth, still.y.wealth) == (base.x.wealth, base.y.wealth)


def test_a_drift_moves_the_path_in_use_not_a_constant_one() -> None:
    # The apartment bought outright: its end value is its value, on the historical index.
    spec = bought_outright()
    assert spec.x.home is not None
    spec = replace(spec, x=replace(spec.x, home=replace(spec.x.home, value_mode="historical")))
    base, up = run(spec, MACRO), run(spec, MACRO, Change(value_drift=0.01))
    assert up.x.wealth / base.x.wealth == pytest.approx(1.01**10, rel=1e-12)
    # The market side of one deposit: one more point a year on every day held.
    saver = ScenarioSpec(
        OptionSpec(account=MARKET, one_off=[Deposit(START, 1_000.0)]), OptionSpec(), spec.end
    )
    grown = run(saver, MACRO, Change(market_drift=0.01)).x.wealth / run(saver, MACRO).x.wealth
    years = (spec.end - START).days / 365.25
    assert grown == pytest.approx(1.01**years, rel=1e-12)


def test_a_rent_that_follows_the_value_follows_its_drift() -> None:
    spec = scenario(rent_growth="value")
    base, up = run(spec, MACRO).x.home, run(spec, MACRO, Change(value_drift=0.01)).x.home
    assert base is not None
    assert up is not None
    assert up.rent[-1] / base.rent[-1] == pytest.approx(1.01 ** (119 / 12), rel=1e-12)
    assert up.payment == pytest.approx(base.payment)


def test_a_tax_shift_moves_the_gains_tax_and_the_betterment_tax() -> None:
    taxed = replace(MARKET, taxes=Taxes(gains=0.25, dividend=0.0))
    saver = ScenarioSpec(
        OptionSpec(account=taxed, one_off=[Deposit(START, 1_000.0)]), OptionSpec(), END_10
    )
    base, up = run(saver, MACRO).x.market, run(saver, MACRO, Change(tax_shift=0.05)).x.market
    assert base is not None
    assert up is not None
    assert up.tax - base.tax == pytest.approx(0.05 * base.taxable_gain)
    spec = scenario()
    home_base = run(spec, MACRO, Change(historical=True)).x.home  # no linear rule in the way
    home_up = run(spec, MACRO, Change(historical=True, tax_shift=0.05)).x.home
    assert home_base is not None
    assert home_up is not None
    assert home_up.betterment[-1] == pytest.approx(home_base.betterment[-1] * 0.30 / 0.25)


def test_the_sensitivity_moves_each_input_both_ways() -> None:
    moves = {m.input: m for m in sensitivity(scenario(), MACRO)}
    assert list(moves) == ["appreciation", "mortgage_rates", "rent", "market_return", "taxes"]
    assert [moves[name].step for name in moves] == [0.01, 0.01, 0.10, 0.01, 0.05]
    # What is good for the apartment raises "apartment minus market", and the other way.
    for name, sign in (
        ("appreciation", 1),
        ("rent", 1),
        ("mortgage_rates", -1),
        ("market_return", -1),
    ):
        move = moves[name]
        assert move.up is not None
        assert move.down is not None
        assert move.up * sign > 0, name
        assert move.down * sign < 0, name
    # A rate cannot go below zero: a track at half a percent falls by less than it rises.
    spec = scenario()
    assert spec.x.home is not None
    low = [replace(t, rate=0.005) for t in spec.x.home.plan.tracks if t.kind is RateKind.FIXED]
    cheap = replace(spec.x.home, plan=replace(spec.x.home.plan, tracks=low, equity=1_200_000))
    rates = {m.input: m for m in sensitivity(replace(spec, x=replace(spec.x, home=cheap)), MACRO)}[
        "mortgage_rates"
    ]
    assert rates.up is not None
    assert rates.down is not None
    assert abs(rates.down) < abs(rates.up)


def test_the_sensitivity_leaves_out_what_the_scenario_does_not_have() -> None:
    saver = ScenarioSpec(
        OptionSpec(account=MARKET, one_off=[Deposit(START, 1_000.0)]),
        OptionSpec(account=replace(MARKET, taxes=Taxes(gains=0.25, dividend=0.0))),
        END_10,
    )
    assert [m.input for m in sensitivity(saver, MACRO)] == ["market_return", "taxes"]
    no_rent = scenario()
    assert no_rent.x.home is not None
    plan = replace(no_rent.x.home.plan, rent_mode=RentMode.NONE)
    bare = replace(no_rent, x=replace(no_rent.x, home=replace(no_rent.x.home, plan=plan)))
    assert "rent" not in [m.input for m in sensitivity(bare, MACRO)]
