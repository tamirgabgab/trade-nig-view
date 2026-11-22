"""Trading sessions and 4h resampling: hand vectors, a scalar golden model and properties."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.data.resample import resample_intraday
from app.data.sessions import (
    daily_factor_per_session,
    local_wall_seconds,
    session_days,
    session_first_index,
)
from app.models.bars import BarFrame, IntArray, Interval, date_to_ts
from app.models.symbols import SymbolInfo, parse_session_start

NEW_YORK = "America/New_York"
NY = ZoneInfo(NEW_YORK)
FUTURES_START = 18 * 60


def ny(year: int, month: int, day: int, hour: int, minute: int = 0) -> int:
    """UTC epoch seconds of a New York wall-clock time."""
    return int(datetime(year, month, day, hour, minute, tzinfo=NY).timestamp())


def day_number(day: date) -> int:
    return date_to_ts(day) // 86_400


def hourly(times: list[int], closes: list[float] | None = None) -> BarFrame:
    """1h bars with O = C - 0.5, H = C + 1, L = C - 1 and volume 10 per bar."""
    closes = closes if closes is not None else [100.0 + i for i in range(len(times))]
    return BarFrame.from_columns(
        time=times,
        open=[c - 0.5 for c in closes],
        high=[c + 1.0 for c in closes],
        low=[c - 1.0 for c in closes],
        close=closes,
        volume=[10.0] * len(times),
    )


def stock_day(year: int, month: int, day: int) -> list[int]:
    """The seven regular-hours 1h bar starts of a US stock session (09:30 ... 15:30)."""
    return [ny(year, month, day, 9 + i, 30) for i in range(7)]


# ---------------------------------------------------------------- session dates


def test_parse_session_start() -> None:
    assert parse_session_start("18:00") == 1080
    assert parse_session_start("9:30") == 570
    for bad in ("18", "18:0", "24:00", "00:00", "ab:cd", "18:00:00"):
        with pytest.raises(ValueError, match="session_start"):
            parse_session_start(bad)


def test_symbol_info_rejects_a_bad_session_start() -> None:
    with pytest.raises(ValueError, match="session_start"):
        SymbolInfo(
            symbol="X", display="X", name="x", type="future", group="F", exchange="E",
            session_start="25:00",
        )  # fmt: skip
    info = SymbolInfo(
        symbol="X", display="X", name="x", type="future", group="F", exchange="E",
        session_start="18:00",
    )  # fmt: skip
    assert info.session_start_minutes == FUTURES_START


def test_local_wall_seconds_follow_daylight_saving() -> None:
    summer, winter = ny(2026, 7, 6, 9, 30), ny(2026, 1, 5, 9, 30)
    assert summer - date_to_ts(date(2026, 7, 6)) == 13 * 3600 + 1800  # 13:30 UTC (EDT)
    assert winter - date_to_ts(date(2026, 1, 5)) == 14 * 3600 + 1800  # 14:30 UTC (EST)
    wall = local_wall_seconds(np.array([summer, winter]), NEW_YORK)
    assert list(wall % 86_400) == [9 * 3600 + 1800] * 2


def test_stock_sessions_are_calendar_days_in_the_exchange_zone() -> None:
    # 15:30 New York in winter is 20:30 UTC, still the same session date.
    times = np.array([ny(2026, 1, 5, 9, 30), ny(2026, 1, 5, 15, 30), ny(2026, 1, 6, 9, 30)])
    assert list(session_days(times, NEW_YORK)) == [
        day_number(date(2026, 1, 5)),
        day_number(date(2026, 1, 5)),
        day_number(date(2026, 1, 6)),
    ]


def test_futures_bars_from_18_00_belong_to_the_next_trade_date() -> None:
    times = np.array(
        [
            ny(2026, 7, 5, 18),  # Sunday evening -> Monday's session
            ny(2026, 7, 5, 23),
            ny(2026, 7, 6, 0),
            ny(2026, 7, 6, 16),  # last bar before the 17:00 break
            ny(2026, 7, 6, 18),  # -> Tuesday's session
        ]
    )
    monday, tuesday = day_number(date(2026, 7, 6)), day_number(date(2026, 7, 7))
    assert list(session_days(times, NEW_YORK, FUTURES_START)) == [monday] * 4 + [tuesday]


def test_empty_inputs() -> None:
    empty = np.empty(0, dtype=np.int64)
    assert len(session_days(empty, NEW_YORK)) == 0
    assert len(session_first_index(empty)) == 0
    assert resample_intraday(BarFrame.empty(), empty, Interval.H4).time.size == 0


def test_session_first_index() -> None:
    days = np.array([5, 5, 5, 6, 6, 9])
    assert list(session_first_index(days)) == [0, 0, 0, 3, 3, 5]


def test_daily_factor_per_session_picks_the_session_or_nearest_earlier_day() -> None:
    daily_time = np.array([date_to_ts(date(2026, 1, d)) for d in (5, 6, 8)])
    factor = np.array([0.98, 0.99, 1.0])
    sessions = np.array([day_number(date(2026, 1, d)) for d in (2, 5, 6, 7, 8, 9)])
    out = daily_factor_per_session(sessions, daily_time, factor)
    # before the first daily bar -> first factor; gap (7th) -> 6th; after the last -> last.
    assert list(out) == [0.98, 0.98, 0.99, 0.99, 1.0, 1.0]
    empty = np.empty(0, dtype=np.int64)
    assert list(daily_factor_per_session(sessions, empty, np.empty(0))) == [1.0] * 6


# ---------------------------------------------------------------- 4h hand vectors


def test_stock_4h_bars_are_0930_and_1330_like_tradingview() -> None:
    times = stock_day(2026, 7, 6)
    frame = hourly(times)
    out = resample_intraday(frame, session_days(frame.time, NEW_YORK), Interval.H4)
    assert list(out.time) == [ny(2026, 7, 6, 9, 30), ny(2026, 7, 6, 13, 30)]
    assert list(out.open) == [99.5, 103.5]  # first bar of each block
    assert list(out.close) == [103.0, 106.0]  # last bar of each block
    assert list(out.high) == [104.0, 107.0]
    assert list(out.low) == [99.0, 103.0]
    assert list(out.volume) == [40.0, 30.0]


def test_futures_4h_bars_start_at_the_18_00_session_open() -> None:
    session = [ny(2026, 7, 5, 18) + h * 3600 for h in range(23)]  # 18:00 ... 16:00
    frame = hourly(session)
    days = session_days(frame.time, NEW_YORK, FUTURES_START)
    out = resample_intraday(frame, days, Interval.H4)
    starts = [datetime.fromtimestamp(t, NY).hour for t in out.time]
    assert starts == [18, 22, 2, 6, 10, 14]
    assert list(out.volume) == [40.0] * 5 + [30.0]  # 14:00-17:00 block has 3 bars


def test_4h_blocks_restart_each_session_and_tolerate_missing_hours() -> None:
    day1 = stock_day(2026, 7, 6)
    day2 = stock_day(2026, 7, 7)
    del day2[1]  # 10:30 missing: the block still starts at 09:30
    frame = hourly(day1 + day2)
    out = resample_intraday(frame, session_days(frame.time, NEW_YORK), Interval.H4)
    assert list(out.time) == [
        ny(2026, 7, 6, 9, 30),
        ny(2026, 7, 6, 13, 30),
        ny(2026, 7, 7, 9, 30),
        ny(2026, 7, 7, 13, 30),
    ]
    assert list(out.volume) == [40.0, 30.0, 30.0, 30.0]


def test_resample_intraday_identity_and_bad_interval() -> None:
    frame = hourly(stock_day(2026, 7, 6))
    days = session_days(frame.time, NEW_YORK)
    assert resample_intraday(frame, days, Interval.H1) is frame
    with pytest.raises(ValueError, match="intraday grouping"):
        resample_intraday(frame, days, Interval.D1)


# ---------------------------------------------------------------- golden model + properties


def golden_4h(frame: BarFrame, days: IntArray) -> BarFrame:
    """Scalar reference: walk the bars, open a new block on a new session or 4h boundary."""
    out: list[list[float]] = []
    session_open = 0
    current: tuple[int, int] | None = None
    for i in range(len(frame)):
        if i == 0 or days[i] != days[i - 1]:
            session_open = int(frame.time[i])
        key = (int(days[i]), (int(frame.time[i]) - session_open) // (4 * 3600))
        if key != current:
            current = key
            out.append([
                float(frame.time[i]), frame.open[i], frame.high[i], frame.low[i],
                frame.close[i], frame.adj_close[i], frame.volume[i],
            ])  # fmt: skip
        else:
            row = out[-1]
            row[2] = max(row[2], frame.high[i])
            row[3] = min(row[3], frame.low[i])
            row[4] = frame.close[i]
            row[5] = frame.adj_close[i]
            row[6] += frame.volume[i]
    table = np.array(out, dtype=np.float64).reshape(-1, 7)
    return BarFrame(
        time=table[:, 0].astype(np.int64),
        open=table[:, 1],
        high=table[:, 2],
        low=table[:, 3],
        close=table[:, 4],
        adj_close=table[:, 5],
        volume=table[:, 6],
    )


@st.composite
def hourly_frames(draw: st.DrawFn) -> tuple[BarFrame, str, int | None]:
    """Random 1h bars: random gaps (missing hours, nights, weekends) across DST changes."""
    kind = draw(st.sampled_from(["stock", "future", "forex"]))
    zone, start_min = {
        "stock": (NEW_YORK, None),
        "future": (NEW_YORK, FUTURES_START),
        "forex": (NEW_YORK, 17 * 60),
    }[kind]
    n = draw(st.integers(min_value=1, max_value=120))
    first = draw(
        st.datetimes(min_value=datetime(2024, 1, 1), max_value=datetime(2026, 12, 1))
    ).replace(minute=0, second=0, microsecond=0, tzinfo=UTC)
    gaps = draw(st.lists(st.sampled_from([1, 1, 1, 1, 2, 3, 17, 49]), min_size=n, max_size=n))
    t = int(first.timestamp())
    times: list[int] = []
    for gap in gaps:
        times.append(t)
        t += gap * 3600
    closes = draw(st.lists(st.floats(1.0, 1000.0), min_size=n, max_size=n))
    frame = hourly(times, closes)
    volume = draw(st.lists(st.floats(0.0, 1e6), min_size=n, max_size=n))
    frame = BarFrame(
        frame.time, frame.open, frame.high, frame.low, frame.close, frame.adj_close,
        np.array(volume),
    )  # fmt: skip
    return frame, zone, start_min


@settings(max_examples=300)
@given(hourly_frames())
def test_4h_matches_the_scalar_golden_model(case: tuple[BarFrame, str, int | None]) -> None:
    frame, zone, start_min = case
    days = session_days(frame.time, zone, start_min)
    got = resample_intraday(frame, days, Interval.H4)
    want = golden_4h(frame, days)
    assert np.array_equal(got.time, want.time)
    for name in ("open", "high", "low", "close", "adj_close", "volume"):
        np.testing.assert_allclose(getattr(got, name), getattr(want, name), rtol=1e-9, atol=1e-12)


@settings(max_examples=300)
@given(hourly_frames())
def test_4h_preserves_extremes_totals_and_never_spans_sessions(
    case: tuple[BarFrame, str, int | None],
) -> None:
    frame, zone, start_min = case
    days = session_days(frame.time, zone, start_min)
    out = resample_intraday(frame, days, Interval.H4)
    assert out.high.max() == frame.high.max()
    assert out.low.min() == frame.low.min()
    assert np.isclose(out.volume.sum(), frame.volume.sum(), rtol=1e-12)
    assert np.all(np.diff(out.time) > 0)
    # Every output bar covers at most 4 hours of input, all from one session.
    block = np.searchsorted(out.time, frame.time, side="right") - 1
    assert np.all(frame.time - out.time[block] < 4 * 3600)
    assert np.all(days == session_days(out.time, zone, start_min)[block])


@settings(max_examples=300)
@given(hourly_frames(), st.data())
def test_4h_has_no_lookahead(case: tuple[BarFrame, str, int | None], data: st.DataObject) -> None:
    """4h bars built from a prefix equal the full result, except the (partial) last bar."""
    frame, zone, start_min = case
    k = data.draw(st.integers(min_value=1, max_value=len(frame)))
    days = session_days(frame.time, zone, start_min)
    full = resample_intraday(frame, days, Interval.H4)
    prefix = resample_intraday(frame.take(slice(0, k)), days[:k], Interval.H4)
    completed = len(prefix) - 1
    assert prefix.take(slice(0, completed)).equals(full.take(slice(0, completed)))
    assert prefix.time[-1] == full.time[completed]
