from __future__ import annotations

from datetime import date

import numpy as np
import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.models.bars import BarFrame, date_to_ts, ts_to_date, ts_to_iso_dates


def test_date_to_ts_is_midnight_utc() -> None:
    assert date_to_ts(date(1970, 1, 1)) == 0
    assert date_to_ts(date(2026, 11, 20)) == 1_795_132_800


@given(st.dates(min_value=date(1900, 1, 1), max_value=date(2200, 12, 31)))
def test_ts_date_roundtrip(day: date) -> None:
    assert ts_to_date(date_to_ts(day)) == day


def test_iso_dates_vectorised() -> None:
    times = np.array([date_to_ts(date(2026, 1, 2)), date_to_ts(date(2026, 2, 28))])
    assert ts_to_iso_dates(times) == ["2026-01-02", "2026-02-28"]


def test_columns_must_have_equal_length() -> None:
    with pytest.raises(ValueError, match="different lengths"):
        BarFrame.from_columns([0, 1], [1.0], [1.0], [1.0], [1.0])


def test_from_columns_defaults_adj_close_and_volume() -> None:
    frame = BarFrame.from_columns([0], [1.0], [2.0], [0.5], [1.5])
    assert frame.adj_close.tolist() == [1.5]
    assert frame.volume.tolist() == [0.0]


def test_take_concat_and_equals() -> None:
    frame = BarFrame.from_columns(
        [0, 86400, 172800], [1.0, 2, 3], [2.0, 3, 4], [0.5, 1, 2], [1.5, 2, 3]
    )
    head, tail = frame.take(slice(0, 1)), frame.take(slice(1, None))
    assert BarFrame.concat([head, tail]).equals(frame)
    assert not head.equals(frame)
    assert len(BarFrame.concat([])) == 0


def test_session_column_is_optional_and_follows_take_and_concat() -> None:
    frame = BarFrame.from_columns([0, 1, 2], [1.0] * 3, [2.0] * 3, [0.5] * 3, [1.5] * 3)
    assert frame.session is None
    assert frame.take(slice(1, None)).session is None
    with_session = frame.with_session(np.array([7, 7, 8], dtype=np.int64))
    masked = with_session.take(np.array([True, False, True])).session
    assert masked is not None
    assert masked.tolist() == [7, 8]
    head, tail = with_session.take(slice(0, 1)), with_session.take(slice(1, None))
    joined = BarFrame.concat([head, tail]).session
    assert joined is not None
    assert joined.tolist() == [7, 7, 8]
    assert BarFrame.concat([head, frame]).session is None
    assert with_session.equals(frame)  # sessions are not compared
    with pytest.raises(ValueError, match="different lengths"):
        frame.with_session(np.array([1], dtype=np.int64))
