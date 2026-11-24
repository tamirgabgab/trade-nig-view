"""The volatility cone (``app.analysis.volatility``): horizons, the helpers, the HAR band's
calibration, the squeeze on a series whose calm and wild phases alternate, the shares and the
1h realised variance."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.analysis import volatility as vol
from app.analysis.synthetic import Scenario, synthetic_bars
from app.models.bars import BarFrame

DAY = 86_400


@pytest.mark.parametrize(
    ("per_year", "expected"),
    [
        (252, {"week": 5, "month": 21, "quarter": 63, "half": 126, "year": 252}),
        (52, {"month": 4, "quarter": 13, "half": 26, "year": 52}),
        (12, {"quarter": 3, "half": 6, "year": 12}),
        (1, {}),
    ],
)
def test_calendar_horizons_in_bars(per_year: float, expected: dict[str, int]) -> None:
    assert vol.horizon_bars(per_year) == expected


def test_helpers() -> None:
    x = np.arange(6, dtype=np.float64)
    np.testing.assert_allclose(vol.forward_mean(x, 2), [1.5, 2.5, 3.5, 4.5, np.nan, np.nan])
    np.testing.assert_allclose(vol.trailing_mean(x, 3), [np.nan, np.nan, 1, 2, 3, 4])
    assert vol.qlike(np.array([2.0, 3.0]), np.array([2.0, 3.0])) == 0.0
    assert vol.qlike(np.array([2.0]), np.array([1.0])) == pytest.approx(1 - math.log(2))
    lo, hi = vol.wilson(5, 10)
    assert lo == pytest.approx(0.2366, abs=1e-4)
    assert hi == pytest.approx(0.7634, abs=1e-4)
    assert all(math.isnan(v) for v in vol.wilson(0, 0))
    assert vol.spaced(np.array([0, 1, 2, 5, 6, 10]), 3) == 3


def test_realized_variance_from_hourly_bars() -> None:
    # Two daily bars; sessions 0 (dropped: no previous close) and 1 with three hourly closes.
    hourly = BarFrame.from_columns(
        time=np.array([0, 3600, DAY, DAY + 3600, DAY + 7200]),
        open=np.ones(5),
        high=np.full(5, 2.0),
        low=np.full(5, 0.5),
        close=np.array([1.0, 1.1, 1.21, 1.1, 1.1]),
    ).with_session(np.array([0, 0, 1, 1, 1]))
    daily = BarFrame.from_columns(
        time=np.array([0, DAY]), open=np.ones(2), high=np.ones(2), low=np.ones(2), close=np.ones(2)
    )
    rv = vol.realized_from_hourly(daily, hourly)
    g = math.log(1.1)
    assert math.isnan(rv[0])
    assert rv[1] == pytest.approx(2 * g * g)  # +g (overnight), -g, 0


def test_a_missing_hourly_session_leaves_the_next_day_without_realised_variance() -> None:
    # Daily bars on days 0, 1 and 2; the 1h data has sessions 0 and 2 only: day 2's first return
    # would span two days of moves.
    hourly = BarFrame.from_columns(
        time=np.array([0, 3600, 2 * DAY, 2 * DAY + 3600]),
        open=np.ones(4),
        high=np.full(4, 2.0),
        low=np.full(4, 0.5),
        close=np.array([1.0, 1.1, 1.3, 1.2]),
    ).with_session(np.array([0, 0, 2, 2]))
    daily = BarFrame.from_columns(
        time=np.arange(3) * DAY, open=np.ones(3), high=np.ones(3), low=np.ones(3), close=np.ones(3)
    )
    assert np.isnan(vol.realized_from_hourly(daily, hourly)).all()


def test_har_features_add_the_horizon_only_beyond_the_har_lags() -> None:
    frame = synthetic_bars(Scenario.RANDOM_WALK, 1, 100)
    assert vol.har_features(frame, 5).shape == (100, 4)  # 1, q1, q5, q22: no second q5
    assert vol.har_features(frame, 63).shape == (100, 5)


def test_too_short_history_has_no_cone() -> None:
    assert vol.cone(synthetic_bars(Scenario.RANDOM_WALK, 1, 2)) is None
    assert vol.cone(synthetic_bars(Scenario.RANDOM_WALK, 1, 20)) is None  # under MIN_WINDOWS


def test_random_walk_cone_is_calibrated_and_has_no_squeeze_edge() -> None:
    c = vol.cone(synthetic_bars(Scenario.RANDOM_WALK, 1, 2000))
    assert c is not None
    assert c.bars_per_year == 262  # business days
    assert [h.label for h in c.horizons] == ["week", "month", "quarter", "half", "year"]
    month = c.main
    assert month.label == "month"
    assert month.bars == 22
    assert month.ci[0] < month.current < month.ci[1]
    assert month.percentiles[0] <= month.current <= month.percentiles[-1]
    assert month.forecast is not None
    assert month.forecast.coverage is not None
    assert 0.7 <= month.forecast.coverage <= 0.95
    assert month.forecast.low < month.forecast.median < month.forecast.high
    # 2000 bars hold fewer than 30 independent quarters: no HAR forecast there.
    assert c.horizons[2].forecast is None
    assert c.squeeze is not None
    assert c.squeeze.base_rate < 0.05  # constant volatility never expands by 1.5
    assert {s.estimator for s in c.scores} == {*vol.hv.ESTIMATORS, "har"}
    assert [s.qlike for s in c.scores] == sorted(s.qlike for s in c.scores)


def test_alternating_volatility_squeeze_predicts_expansion() -> None:
    """``accumulation`` alternates calm and wild phases every 25 bars: after a calm month the
    next one is wild far more often than after any bar, and HAR beats the naive forecast."""
    c = vol.cone(synthetic_bars(Scenario.ACCUMULATION, 1, 2000))
    assert c is not None
    s = c.squeeze
    assert s is not None
    assert s.events > s.independent > 10
    assert s.ci[0] > s.base_rate
    assert s.move_events[0] > s.move_all[0]
    f = c.main.forecast
    assert f is not None
    assert f.qlike is not None
    assert f.qlike_naive is not None
    assert f.qlike < f.qlike_naive


def test_shares_are_fractions() -> None:
    c = vol.cone(synthetic_bars(Scenario.SHOCK, 2, 600))
    assert c is not None
    for share in (c.overnight, c.downside):
        assert 0 <= share.window <= 1
        assert 0 <= share.history <= 1


def daily_from_hourly(hourly: BarFrame) -> BarFrame:
    assert hourly.session is not None
    days, start = np.unique(hourly.session, return_index=True)
    end = np.append(start[1:], len(hourly)) - 1
    return BarFrame.from_columns(
        time=days * DAY,
        open=hourly.open[start],
        high=np.maximum.reduceat(hourly.high, start),
        low=np.minimum.reduceat(hourly.low, start),
        close=hourly.close[end],
    )


def test_realised_variance_joins_the_scores() -> None:
    hourly = synthetic_bars(Scenario.VOLATILITY_REGIME, 4, 7 * 700, intraday=True)
    daily = daily_from_hourly(hourly)
    c = vol.cone(daily, realised_1h=vol.realized_from_hourly(daily, hourly))
    assert c is not None
    names = {s.estimator for s in c.scores}
    assert "realized" in names
    for s in c.scores:
        assert s.n >= vol.MIN_WINDOWS
        assert (s.bias is None) == (s.estimator == "realized")
    # Without enough 1h days the table falls back to the daily estimators.
    few = np.full(len(daily), np.nan)
    few[-30:] = 1e-4
    fallback = vol.cone(daily, realised_1h=few)
    assert fallback is not None
    assert "realized" not in {s.estimator for s in fallback.scores}
