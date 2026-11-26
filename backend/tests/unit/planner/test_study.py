"""Layer 1 of the comparison metrics: each one against an answer known in advance."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from app.planner.deposits import Deposit, add_months, day_number
from app.planner.inflation import CpiPath
from app.planner.market import AssetData, PlanError, Taxes
from app.planner.scenario import Account, PairResult, Side, run_pair
from app.planner.study import (
    breakeven,
    effective_samples,
    rolling,
    summarize,
    time_average,
    win_map,
    win_probability,
)

FLAT_CPI = CpiPath(np.array([0, 40_000]), np.array([100.0, 100.0]))
FIRST = date(2000, 1, 10)


def grower(rate: float) -> Account:
    days = np.arange(day_number(FIRST), day_number(FIRST) + 40 * 366, dtype=np.int64)
    close = (1.0 + rate) ** ((days - days[0]) / 365.25)
    ones = np.ones(len(days))
    asset = AssetData("MKT", 1.0, days, close, close, close, close, ones, ones)
    return Account([asset], taxes=Taxes(gains=0.0, dividend=0.0))


def plan(x_rate: float, y_rate: float, shift: int = 0, months: int = 120) -> PairResult:
    """1,000 a month for ``months`` months into ``x_rate``, mirrored into ``y_rate``."""
    start = add_months(FIRST, shift)
    deposits = [Deposit(add_months(start, k), 1_000.0) for k in range(months)]
    x = Side(account=grower(x_rate), deposits=deposits)
    return run_pair(x, Side(account=grower(y_rate)), add_months(start, months), FLAT_CPI)


# ---------------------------------------------------------------- P(A > B)


def test_win_probability_counts_a_tie_as_half() -> None:
    a = np.array([3.0, 1.0, 2.0, 7.0])
    assert win_probability(a, a) == 0.5
    assert win_probability(a, a - 1) == 1.0
    assert win_probability(a, a + 1) == 0.0
    # One win, one tie, two losses.
    assert win_probability(a, np.array([1.0, 1.0, 5.0, 9.0])) == pytest.approx(1.5 / 4)


def test_identical_options_win_half_the_windows() -> None:
    windows, skipped = rolling(lambda shift: plan(0.05, 0.05, shift), range(0, 24))
    summary = summarize(windows, term_months=120)
    assert (len(windows), skipped) == (24, [])
    assert summary.p_win == 0.5
    assert summary.median_difference == 0.0


def test_the_better_asset_wins_every_window_by_a_known_margin() -> None:
    windows, _ = rolling(lambda shift: plan(0.06, 0.02, shift), range(0, 36, 3))
    summary = summarize(windows, term_months=120)
    assert summary.p_win == 1.0
    assert summary.x_xirr == pytest.approx(0.06, abs=1e-9)
    assert summary.y_xirr == pytest.approx(0.02, abs=1e-9)
    assert summary.windows == 12
    assert (summary.first, summary.last) == (FIRST, add_months(FIRST, 33))
    # The same plan in every window: its end values differ only by the days in its months.
    differences = [w.result.x.wealth - w.result.y.wealth for w in windows]
    assert summary.median_difference == pytest.approx(float(np.median(differences)))
    assert summary.median_difference == pytest.approx(35_000, rel=0.05)


# ---------------------------------------------------------------- overlapping windows


def test_effective_samples_of_overlapping_windows() -> None:
    assert effective_samples(span_months=120, term_months=240) == pytest.approx(1.5)
    assert effective_samples(span_months=0, term_months=240) == 1.0
    assert effective_samples(span_months=360, term_months=120) == pytest.approx(4.0)
    windows, _ = rolling(lambda shift: plan(0.05, 0.05, shift), range(0, 61))
    assert summarize(windows, term_months=120).effective == pytest.approx(1.5)


def test_windows_that_cannot_run_are_counted_not_hidden() -> None:
    def run(shift: int) -> PairResult:
        if shift % 2:
            raise PlanError("no data here")
        return plan(0.05, 0.04, shift)

    windows, skipped = rolling(run, range(0, 6))
    assert [w.shift for w in windows] == [0, 2, 4]
    assert skipped == [(1, "no data here"), (3, "no data here"), (5, "no data here")]
    with pytest.raises(PlanError, match="No window"):
        summarize([], term_months=120)


# ---------------------------------------------------------------- breakeven rates


def test_breakeven_finds_the_root_or_says_there_is_none() -> None:
    assert breakeven(lambda v: v - 0.03, -0.1, 0.3) == pytest.approx(0.03, abs=1e-9)
    assert breakeven(lambda v: 0.03 - v, -0.1, 0.3) == pytest.approx(0.03, abs=1e-9)
    assert breakeven(lambda v: v * v + 1.0, -1.0, 1.0) is None
    assert breakeven(lambda v: v - 5.0, 0.0, 1.0) is None

    def refuses(v: float) -> float:
        raise PlanError("cannot run")

    assert breakeven(refuses, 0.0, 1.0) is None


def test_a_breakeven_return_reproduces_equality() -> None:
    def difference(rate: float) -> float:
        result = plan(rate, 0.045)
        return result.x.wealth - result.y.wealth

    rate = breakeven(difference, -0.2, 0.4)
    assert rate == pytest.approx(0.045, abs=1e-9)
    assert rate is not None
    assert difference(rate) == pytest.approx(0.0, abs=1e-3)


# ---------------------------------------------------------------- the win map, the time average


def test_the_win_map_has_a_cell_per_start_and_horizon() -> None:
    def cell(shift: int, months: int) -> PairResult:
        if shift == 24 and months == 120:
            raise PlanError("past the data")
        return plan(0.06, 0.02, shift, months)

    cells = win_map(cell, shifts=[0, 12, 24], horizons=[60, 120])
    assert [(c.shift, c.months) for c in cells] == [
        (0, 60), (0, 120), (12, 60), (12, 120), (24, 60), (24, 120),
    ]  # fmt: skip
    assert [c.result is None for c in cells] == [False] * 5 + [True]
    first = cells[0].result
    assert first is not None
    assert (first.x.xirr, first.y.xirr) == pytest.approx((0.06, 0.02), abs=1e-9)


def test_the_time_averaged_net_worth_by_hand() -> None:
    # At a zero return the worth after k months is what was put in: 1,000 k. Its average over
    # an exit month drawn evenly from 1..12 is 1,000 * 6.5.
    average = time_average(lambda months: plan(0.0, 0.0, 0, months), range(1, 13))
    assert (average.x, average.y) == pytest.approx((6_500.0, 6_500.0))
    assert [p.months for p in average.points] == list(range(1, 13))
    assert average.points[-1].x == pytest.approx(12_000.0)
    # Months that cannot run (a horizon past the data) are left out of the average.

    def partial(months: int) -> PairResult:
        if months > 6:
            raise PlanError("past the data")
        return plan(0.0, 0.0, 0, months)

    assert time_average(partial, range(1, 13)).x == pytest.approx(3_500.0)
