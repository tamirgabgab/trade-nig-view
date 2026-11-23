"""OBV: hand vector and the whole-history lookback."""

from __future__ import annotations

import numpy as np

from app.indicators.catalog import CATALOG
from app.indicators.obv import WHOLE_HISTORY
from app.models.bars import BarFrame
from tests.unit.indicators.test_composites import arr

OBV = CATALOG["obv"]


def test_hand_vector() -> None:
    close, volume = arr(10, 11, 11, 9, 12), arr(5, 6, 7, 8, 9)
    frame = BarFrame.from_columns(
        time=np.arange(5) * 86_400, open=close, high=close, low=close, close=close, volume=volume
    )
    np.testing.assert_array_equal(OBV.run(frame)["obv"], arr(0, 6, 6, -2, 7))


def test_whole_history_lookback() -> None:
    assert OBV.params == ()
    assert OBV.total_lookback({}) == WHOLE_HISTORY
    assert OBV.warmup({}) == 0
