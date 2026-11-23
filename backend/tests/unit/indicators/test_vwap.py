"""VWAP: hand vector with a session reset, zero volume, daily bars without sessions."""

from __future__ import annotations

import numpy as np

from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame
from tests.unit.indicators.test_composites import arr

NAN = np.nan
VWAP = CATALOG["vwap"]


def frame(close: np.ndarray, volume: np.ndarray, session: list[int] | None) -> BarFrame:
    bars = BarFrame.from_columns(
        time=np.arange(len(close)) * 3_600,
        open=close,
        high=close + 1,
        low=close - 1,
        close=close,
        volume=volume,
    )
    return bars if session is None else bars.with_session(np.array(session, dtype=np.int64))


def test_resets_at_each_session() -> None:
    bars = frame(arr(10, 20, 30, 40), arr(1, 3, 1, 1), [0, 0, 1, 1])
    out = VWAP.run(bars, {"source": "close"})["vwap"]
    np.testing.assert_allclose(out, arr(10, 17.5, 30, 35))
    # hlc3 of these bars is the close (high and low are symmetric around it)
    np.testing.assert_allclose(VWAP.run(bars)["vwap"], out)


def test_zero_volume_is_nan_until_volume_arrives() -> None:
    out = VWAP.run(frame(arr(10, 20, 30), arr(0, 0, 2), [5, 5, 5]), {"source": "close"})["vwap"]
    np.testing.assert_array_equal(out, arr(NAN, NAN, 30))


def test_daily_bars_have_no_vwap() -> None:
    out = VWAP.run(frame(arr(10, 20, 30), arr(1, 1, 1), None))["vwap"]
    assert np.isnan(out).all()


def test_a_slice_starting_mid_session_keeps_the_session_column() -> None:
    bars = frame(arr(10, 20, 30, 40), arr(1, 3, 1, 1), [0, 0, 1, 1])
    out = VWAP.run(bars.take(slice(1, None)), {"source": "close"})["vwap"]
    np.testing.assert_allclose(out, arr(20, 30, 35))
