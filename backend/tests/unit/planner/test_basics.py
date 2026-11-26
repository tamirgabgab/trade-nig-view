"""The planner's CPI model, deposit schedules and XIRR."""

from __future__ import annotations

from datetime import date, time

import numpy as np
import pytest

from app.macro.series import MacroSeries
from app.planner.deposits import Deposit, Recurring, add_months, day_number, expand
from app.planner.inflation import (
    HISTORICAL_FROM,
    assumed_cpi,
    historical_cpi,
    month_starts,
    yearly_rates,
)
from app.planner.xirr import xirr

D0 = day_number(date(2020, 1, 15))


# ---------------------------------------------------------------- inflation


def test_the_mean_path_compounds_the_yearly_rate_monthly() -> None:
    cpi = assumed_cpi(D0, day_number(date(2023, 1, 15)), mu=0.03)
    assert cpi.days[0] == day_number(date(2020, 1, 1))
    assert cpi.values[0] == 100.0
    assert cpi.values[12] == pytest.approx(103.0)
    assert cpi.values[36] == pytest.approx(100 * 1.03**3)
    # Geometric inside a month: half of January's growth by the 16.5th.
    mid = cpi.at(np.array([day_number(date(2020, 1, 1)), day_number(date(2020, 2, 1))])).tolist()
    assert mid == pytest.approx([100.0, 100 * 1.03 ** (1 / 12)])


def test_sampled_years_have_the_asked_mean_sd_and_persistence() -> None:
    rates = yearly_rates(200_000, 0.025, 0.02, 0.6, np.random.default_rng(1))
    assert rates.mean() == pytest.approx(0.025, abs=3e-4)
    assert rates.std() == pytest.approx(0.02, abs=3e-4)
    assert np.corrcoef(rates[:-1], rates[1:])[0, 1] == pytest.approx(0.6, abs=0.01)
    independent = yearly_rates(200_000, 0.025, 0.02, 0.0, np.random.default_rng(2))
    assert abs(np.corrcoef(independent[:-1], independent[1:])[0, 1]) < 0.01
    # No generator, or no spread: the mean path. Rates never fall below -50 %.
    assert yearly_rates(3, 0.02, 0.05, 0.5, None).tolist() == [0.02] * 3
    assert yearly_rates(1000, 0.0, 5.0, 0.0, np.random.default_rng(3)).min() == -0.5


def test_a_sampled_path_is_reproducible_and_positive() -> None:
    kw = {"mu": 0.02, "sigma": 0.03, "phi": 0.5}
    a = assumed_cpi(D0, D0 + 7000, rng=np.random.default_rng(9), **kw)
    b = assumed_cpi(D0, D0 + 7000, rng=np.random.default_rng(9), **kw)
    assert a.values.tolist() == b.values.tolist()
    assert np.all(a.values > 0)
    assert len(a.days) == len(a.values) == len(month_starts(D0, D0 + 7000))


def test_the_historical_index_starts_in_1994() -> None:
    days = np.array([day_number(date(y, 1, 1)) for y in (1985, 1993, 1994, 2000)])
    cpi = historical_cpi(MacroSeries(days, np.array([1.0, 50.0, 60.0, 90.0])))
    assert cpi.days[0] == HISTORICAL_FROM
    assert cpi.values.tolist() == [60.0, 90.0]


# ---------------------------------------------------------------- deposits


def test_add_months_clamps_to_the_month_end() -> None:
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2023, 1, 31), 1) == date(2023, 2, 28)
    assert add_months(date(2023, 11, 15), 3) == date(2024, 2, 15)


def test_expand_merges_one_off_and_recurring_deposits_in_date_order() -> None:
    plan = Recurring(date(2020, 1, 31), 1500.0, every_months=3, count=4, at=time(17, 0))
    out = expand([Deposit(date(2020, 5, 1), 10_000.0)], [plan])
    assert [(d.day, d.amount) for d in out] == [
        (date(2020, 1, 31), 1500.0),
        (date(2020, 4, 30), 1500.0),
        (date(2020, 5, 1), 10_000.0),
        (date(2020, 7, 31), 1500.0),
        (date(2020, 10, 31), 1500.0),
    ]
    assert out[0].at == time(17, 0)


def test_indexed_deposits_step_once_a_year_with_the_cpi() -> None:
    start = date(2020, 1, 1)
    cpi = assumed_cpi(day_number(start), day_number(date(2023, 1, 1)), mu=0.10)
    out = expand([], [Recurring(start, 1000.0, count=26, indexed=True)], cpi)
    amounts = [d.amount for d in out]
    assert amounts[:12] == [1000.0] * 12
    assert amounts[12:24] == pytest.approx([1100.0] * 12)
    assert amounts[24:] == pytest.approx([1210.0] * 2)


# ---------------------------------------------------------------- XIRR


def test_xirr_of_one_deposit_is_its_yearly_growth() -> None:
    assert xirr([0, 365.25], [-100.0, 110.0]) == pytest.approx(0.10, abs=1e-9)
    assert xirr([0, 2 * 365.25], [-100.0, 121.0]) == pytest.approx(0.10, abs=1e-9)
    assert xirr([0, 365.25], [-100.0, 50.0]) == pytest.approx(-0.5, abs=1e-9)


def test_xirr_of_monthly_deposits_at_a_constant_rate_recovers_the_rate() -> None:
    rate = 0.07
    days = np.arange(120) * 30.4375
    end = 120 * 30.4375
    final = float(np.sum(1000.0 * (1 + rate) ** ((end - days) / 365.25)))
    got = xirr([*days, end], [*([-1000.0] * 120), final])
    assert got == pytest.approx(rate, abs=1e-9)
    # A plain CAGR of final over deposited would be far off.
    assert (final / 120_000) ** (1 / 10) - 1 < 0.04


def test_xirr_without_a_sign_change_has_no_answer() -> None:
    assert xirr([0, 100], [-100.0, -5.0]) is None
    assert xirr([0, 100], [100.0, 5.0]) is None
    assert xirr([], []) is None
