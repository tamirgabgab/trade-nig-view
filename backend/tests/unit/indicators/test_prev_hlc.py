"""Previous period H/L/C: hand vectors for day, ISO week and month boundaries (UTC)."""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pytest

from app.indicators.catalog import CATALOG
from app.indicators.obv import WHOLE_HISTORY
from app.indicators.prev_hlc import period_keys
from app.models.bars import BarFrame
from tests.unit.indicators.test_composites import arr

NAN = np.nan
PREV = CATALOG["prev_hlc"]


def ts(text: str) -> int:
    return int(datetime.fromisoformat(text).replace(tzinfo=UTC).timestamp())


def frame(times: list[str], high: list[float], low: list[float], close: list[float]) -> BarFrame:
    return BarFrame.from_columns(
        time=[ts(t) for t in times], open=close, high=high, low=low, close=close
    )


def test_day_period_on_hourly_bars() -> None:
    bars = frame(
        ["2026-03-02T14:30", "2026-03-02T20:30", "2026-03-03T14:30", "2026-03-03T15:30",
         "2026-03-04T14:30"],
        high=[11, 13, 20, 22, 30], low=[9, 8, 18, 15, 29], close=[10, 12, 19, 16, 29.5],
    )  # fmt: skip
    out = PREV.run(bars, {"period": "day"})
    np.testing.assert_array_equal(out["high"], arr(NAN, NAN, 13, 13, 22))
    np.testing.assert_array_equal(out["low"], arr(NAN, NAN, 8, 8, 15))
    np.testing.assert_array_equal(out["close"], arr(NAN, NAN, 12, 12, 16))


def test_iso_week_starts_on_monday_utc() -> None:
    # Fri 2026-03-06, Sun 2026-03-08 23:00 (same ISO week), Mon 2026-03-09 00:00 (next week)
    bars = frame(
        ["2026-03-06T00:00", "2026-03-08T23:00", "2026-03-09T00:00", "2026-03-13T00:00"],
        high=[5, 7, 1, 2], low=[4, 3, 0.5, 1], close=[4.5, 6, 0.8, 1.5],
    )  # fmt: skip
    out = PREV.run(bars, {"period": "week"})
    np.testing.assert_array_equal(out["high"], arr(NAN, NAN, 7, 7))
    np.testing.assert_array_equal(out["low"], arr(NAN, NAN, 3, 3))
    np.testing.assert_array_equal(out["close"], arr(NAN, NAN, 6, 6))


def test_month_skips_empty_months_and_crosses_years() -> None:
    bars = frame(
        ["2025-11-28T00:00", "2025-12-01T00:00", "2025-12-31T00:00", "2026-02-02T00:00"],
        high=[3, 5, 6, 9], low=[1, 4, 2, 8], close=[2, 4.5, 3, 8.5],
    )  # fmt: skip
    out = PREV.run(bars, {"period": "month"})
    # February's previous period with bars is December (January has none)
    np.testing.assert_array_equal(out["high"], arr(NAN, 3, 3, 6))
    np.testing.assert_array_equal(out["low"], arr(NAN, 1, 1, 2))
    np.testing.assert_array_equal(out["close"], arr(NAN, 2, 2, 3))


def test_daily_bars_with_day_period_echo_the_previous_bar() -> None:
    close = arr(10, 11, 12)
    bars = BarFrame.from_columns(
        time=np.arange(3) * 86_400, open=close, high=close + 1, low=close - 1, close=close
    )
    out = PREV.run(bars)
    np.testing.assert_array_equal(out["high"], arr(NAN, 11, 12))
    np.testing.assert_array_equal(out["close"], arr(NAN, 10, 11))


@pytest.mark.parametrize("period", ["day", "week", "month"])
def test_empty_frame(period: str) -> None:
    out = PREV.run(BarFrame.empty(), {"period": period})
    assert all(len(v) == 0 for v in out.values())


def test_period_keys_before_1970_and_week_boundary() -> None:
    times = np.array([ts("1969-12-28T12:00"), ts("1969-12-29T00:00"), ts("1970-01-04T23:59")])
    days = times // 86_400
    np.testing.assert_array_equal(period_keys(days, "week"), [-1, 0, 0])
    np.testing.assert_array_equal(period_keys(days, "month"), [-1, -1, 0])


def test_intraday_days_follow_the_session_not_the_utc_date() -> None:
    # A futures session opening at 22:00 UTC: its evening bar belongs to the next session day.
    times = np.array([ts("2026-11-18T20:00"), ts("2026-11-18T22:00"), ts("2026-11-19T10:00")])
    session = np.array([ts("2026-11-18T00:00"), ts("2026-11-19T00:00"), ts("2026-11-19T00:00")])
    bars = BarFrame(
        time=times,
        open=arr(10, 20, 30),
        high=arr(11, 21, 31),
        low=arr(9, 19, 29),
        close=arr(10, 20, 30),
        adj_close=arr(10, 20, 30),
        volume=arr(1, 1, 1),
    ).with_session(session // 86_400)
    out = PREV.run(bars)
    # Both bars of the 19th's session see the 18th's session (one bar) as the previous day.
    np.testing.assert_array_equal(out["high"], arr(NAN, 11, 11))
    np.testing.assert_array_equal(out["close"], arr(NAN, 10, 10))


def test_spec_contract() -> None:
    assert PREV.category == "structure"
    assert PREV.overlay is True
    assert PREV.total_lookback({"period": "day"}) == WHOLE_HISTORY
    assert PREV.display_shift({"period": "day"}) == 0
    assert all(o.style == {"line_type": "step"} and o.line_width == 1 for o in PREV.outputs)
