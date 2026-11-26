"""The apartment: bracket taxes, the betterment tax, and the net worth by hand."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import numpy as np
import pytest

from app.planner.home import (
    Betterment,
    Bracket,
    HomePlan,
    HomeSeries,
    RentMode,
    assumed_values,
    betterment_tax,
    bracket_tax,
    run_home,
)
from app.planner.market import PlanError
from app.planner.mortgage import Repayment, Track, annuity
from app.planner.tax_presets import BETTERMENT, PURCHASE

SINGLE, ADDITIONAL = PURCHASE[0].brackets, PURCHASE[1].brackets
START = date(2020, 1, 15)
NO_TAX = Betterment(rate=0.0)


def flat(months: int, value: np.ndarray | None = None) -> HomeSeries:
    ones = np.ones(months + 1)
    return HomeSeries(ones if value is None else value, ones, np.full(months + 1, 0.04), ones)


# ---------------------------------------------------------------- taxes


def test_purchase_tax_by_brackets() -> None:
    assert bracket_tax(1_500_000, SINGLE) == 0.0
    assert bracket_tax(1_978_745, SINGLE) == 0.0
    # 2.5 million: 3.5 % of the second slice and 5 % of the rest (about 20,500, as published).
    want = 0.035 * (2_347_040 - 1_978_745) + 0.05 * (2_500_000 - 2_347_040)
    assert bracket_tax(2_500_000, SINGLE) == pytest.approx(want)
    assert want == pytest.approx(20_538.3, abs=0.1)
    top = (
        0.035 * (2_347_040 - 1_978_745)
        + 0.05 * (6_055_070 - 2_347_040)
        + 0.08 * (20_183_565 - 6_055_070)
        + 0.10 * (25_000_000 - 20_183_565)
    )
    assert bracket_tax(25_000_000, SINGLE) == pytest.approx(top)
    # An additional home: 8 % from the first shekel (200,000 on 2.5 million, as published).
    assert bracket_tax(2_500_000, ADDITIONAL) == pytest.approx(200_000)
    assert bracket_tax(7_000_000, ADDITIONAL) == pytest.approx(0.08 * 6_055_070 + 0.10 * 944_930)
    assert bracket_tax(1_000_000, ()) == 0.0


def test_betterment_tax_by_the_laws_parameters() -> None:
    kw = {"bought": date(2016, 1, 1), "sold": date(2026, 1, 1)}
    additional = BETTERMENT[1].spec
    # 25 % of the real gain: sold for 3.0 (net of costs), cost 2.0 indexed by 10 %.
    assert betterment_tax(
        additional, value=3_100_000, net_sale=3_000_000, indexed_cost=2_200_000, **kw
    ) == pytest.approx(0.25 * 800_000)
    # No real gain, no tax.
    assert betterment_tax(additional, value=2e6, net_sale=2e6, indexed_cost=2.1e6, **kw) == 0.0
    # A single home under the ceiling is exempt; above it, only the share over the ceiling.
    single = BETTERMENT[0].spec
    assert betterment_tax(single, value=3e6, net_sale=3e6, indexed_cost=2e6, **kw) == 0.0
    over = betterment_tax(single, value=10_016_000, net_sale=10_016_000, indexed_cost=6e6, **kw)
    assert over == pytest.approx(0.25 * 4_016_000 * 0.5)
    # The linear rule: bought in 2004, sold in 2024: half of the days are after 2014.
    old = betterment_tax(
        additional, value=3e6, net_sale=3e6, indexed_cost=2e6,
        bought=date(2004, 1, 1), sold=date(2024, 1, 1),
    )  # fmt: skip
    assert old == pytest.approx(0.25 * 1e6 * 3652 / 7305)
    # A custom table on the gain replaces all of it.
    custom = Betterment(brackets=(Bracket(500_000, 0.0), Bracket(None, 0.30)))
    assert betterment_tax(custom, value=3e6, net_sale=3e6, indexed_cost=2e6, **kw) == 150_000


# ---------------------------------------------------------------- the apartment


def test_a_cash_purchase_at_a_constant_value_keeps_its_worth_less_the_costs() -> None:
    plan = HomePlan(START, 24, 2_000_000, 2_000_000, [], lawyer=0.005, broker=0.02, selling=0.02)
    result = run_home(plan, flat(24))
    assert (result.loan, result.purchase_tax) == (0.0, 0.0)
    assert result.purchase_costs == pytest.approx(50_000)
    np.testing.assert_allclose(result.net_worth, 2_000_000 * 0.98)
    assert result.dates[0] == START
    assert result.dates[-1] == date(2022, 1, 15)
    # 2.05 million in, 1.96 million out after two years.
    assert result.xirr == pytest.approx((1.96 / 2.05) ** (365.25 / 731) - 1, abs=1e-9)


def test_value_growth_without_costs_is_the_return_and_leverage_raises_it() -> None:
    months = 120
    value = assumed_values(months, 0.05)
    assert value[12] == pytest.approx(1.05)
    cash = run_home(
        HomePlan(START, months, 1_000_000, 1_000_000, [], betterment=NO_TAX), flat(months, value)
    )
    assert cash.net_worth[-1] == pytest.approx(1_000_000 * 1.05**10)
    assert cash.xirr == pytest.approx(0.05, abs=2e-4)  # month dates are not exact twelfths
    # 75 % borrowed at 3 %: the same apartment returns more on the equity.
    track = Track(750_000, 240, rate=0.03)
    geared = run_home(
        HomePlan(START, months, 1_000_000, 250_000, [track], betterment=NO_TAX),
        flat(240, assumed_values(240, 0.05)),
    )
    assert geared.balance[0] == 750_000
    assert geared.payment[1] == pytest.approx(annuity(750_000, 0.03 / 12, 240))
    assert geared.net_worth[-1] == pytest.approx(cash.net_worth[-1] - geared.balance[-1])
    assert geared.xirr is not None
    assert geared.xirr > 0.05


def test_the_monthly_flows_by_hand() -> None:
    cpi = 1.02 ** (np.arange(25) / 12)
    series = HomeSeries(np.ones(25), cpi, np.full(25, 0.04), cpi)
    track = Track(600_000, 24, rate=0.0, repayment=Repayment.EQUAL_PRINCIPAL)
    base = HomePlan(
        START, 24, 1_000_000, 400_000, [track],
        maintenance=0.012, insurance=1200, rent=4000, early_repayment=0.01,
    )  # fmt: skip
    live = run_home(replace(base, rent_mode=RentMode.LIVE), series)
    assert live.payment[1:].tolist() == pytest.approx([25_000.0] * 24)
    assert live.balance[12] == pytest.approx(300_000)
    # Maintenance 1.2 % of a constant million a year, insurance 1,200 a year indexed.
    assert live.costs[12] == pytest.approx(1000 + 100 * 1.02)
    assert live.costs[0] == 0.0
    # Rent of month k is set at its start: 4,000 in month 1, +2 % in month 13.
    assert (live.rent[0], live.rent[1]) == (0.0, 4000.0)
    assert live.rent[13] == pytest.approx(4000 * 1.02)
    # Sold after a year: the balance and a 1 % early-repayment fee come off.
    assert live.net_worth[12] == pytest.approx(1_000_000 - 300_000 * 1.01)
    rented = replace(base, rent_mode=RentMode.RENT_OUT, vacancy=0.05, rent_tax=0.10)
    out = run_home(rented, series)
    assert out.rent[1] == pytest.approx(4000 * 0.95 * 0.90)
    none = run_home(base, series)
    assert none.rent.sum() == 0.0
    assert none.xirr is not None
    assert live.xirr is not None
    assert none.xirr < live.xirr
    assert none.net_worth_real == pytest.approx(none.net_worth[-1] / 1.02**2)


def test_purchase_and_betterment_taxes_reach_the_net_worth() -> None:
    months = 60
    value = assumed_values(months, 0.08)
    plan = HomePlan(
        START, months, 2_500_000, 2_500_000, [],
        purchase_tax=ADDITIONAL, lawyer=0.01, betterment=BETTERMENT[1].spec,
    )  # fmt: skip
    result = run_home(plan, flat(months, value))
    assert result.purchase_tax == pytest.approx(200_000)
    assert result.purchase_costs == pytest.approx(225_000)
    end = 2_500_000 * 1.08**5
    assert result.value[-1] == pytest.approx(end)
    assert result.betterment[-1] == pytest.approx(0.25 * (end - 2_725_000))
    assert result.betterment[0] == 0.0
    assert result.net_worth[-1] == pytest.approx(end - result.betterment[-1])


def test_assumed_values_draws_have_the_asked_mean_and_spread() -> None:
    rng = np.random.default_rng(3)
    ends = np.array([assumed_values(12, 0.04, 0.10, rng)[-1] for _ in range(20_000)])
    assert ends.mean() == pytest.approx(1.04, abs=0.003)
    assert np.log(ends).std() == pytest.approx(0.10, abs=0.003)
    assert assumed_values(24, 0.04, 0.10).tolist() == assumed_values(24, 0.04).tolist()


def test_plans_that_cannot_run_say_why() -> None:
    track = Track(500_000, 120)
    with pytest.raises(PlanError, match="add up"):
        run_home(HomePlan(START, 12, 1_000_000, 400_000, [track]), flat(120))
    with pytest.raises(PlanError, match="equity"):
        run_home(HomePlan(START, 12, 1_000_000, 1_200_000, []), flat(12))
    with pytest.raises(PlanError, match="at least a month"):
        run_home(HomePlan(START, 0, 1_000_000, 1_000_000, []), flat(12))
    with pytest.raises(PlanError, match="do not reach"):
        run_home(HomePlan(START, 12, 1_000_000, 500_000, [track]), flat(24))
