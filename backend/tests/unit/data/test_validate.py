from __future__ import annotations

from datetime import date

import numpy as np

from app.data.validate import validate_bars
from app.models.bars import BarFrame, date_to_ts

D1, D2, D3 = (date_to_ts(date(2026, 1, d)) for d in (5, 6, 7))


def test_sorts_by_time() -> None:
    frame = BarFrame.from_columns(
        [D3, D1, D2], [3.0, 1, 2], [4.0, 2, 3], [2.0, 0.5, 1], [3.5, 1.5, 2.5]
    )
    clean, report = validate_bars(frame)
    assert clean.time.tolist() == [D1, D2, D3]
    assert report.ok


def test_duplicate_keeps_last_occurrence() -> None:
    frame = BarFrame.from_columns(
        [D1, D1, D2], [1.0, 1.1, 2], [2.0, 2.1, 3], [0.5, 0.6, 1], [1.5, 1.6, 2.5]
    )
    clean, report = validate_bars(frame, symbol="X")
    assert clean.time.tolist() == [D1, D2]
    assert clean.close.tolist() == [1.6, 2.5]
    assert report.duplicates_dropped == 1
    assert report.warnings == ("X: dropped 1 duplicate bar(s)",)


def test_drops_inconsistent_and_non_positive_bars() -> None:
    frame = BarFrame.from_columns(
        [D1, D2, D3],
        [1.0, 2.0, 0.0],  # D3: zero price
        [2.0, 2.4, 1.0],  # D2: high < close
        [0.5, 1.0, 0.0],
        [1.5, 2.5, 0.5],
    )
    clean, report = validate_bars(frame, symbol="X")
    assert clean.time.tolist() == [D1]
    assert report.invalid_dropped == 2
    assert "2026-01-06, 2026-01-07" in report.warnings[0]


def test_low_above_body_is_invalid() -> None:
    frame = BarFrame.from_columns([D1], [1.0], [2.0], [1.2], [1.5])
    assert len(validate_bars(frame)[0]) == 0


def test_tolerates_provider_rounding_noise() -> None:
    # high is 1e-7 relative below close: rounding noise, not a broken bar.
    close = 100.0
    frame = BarFrame.from_columns([D1], [99.0], [close * (1 - 1e-7)], [98.0], [close])
    assert len(validate_bars(frame)[0]) == 1


def test_nan_volume_becomes_zero_and_negative_volume_is_invalid() -> None:
    frame = BarFrame.from_columns(
        [D1, D2], [1.0, 1.0], [2.0, 2.0], [0.5, 0.5], [1.5, 1.5], volume=[np.nan, -5.0]
    )
    clean, report = validate_bars(frame)
    assert clean.volume.tolist() == [0.0]
    assert report.invalid_dropped == 1


def test_empty_frame_is_valid() -> None:
    clean, report = validate_bars(BarFrame.empty())
    assert len(clean) == 0
    assert report.ok
