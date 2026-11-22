"""Heikin Ashi transform: hand vectors, invariants and no lookahead."""

from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.analysis.transforms import Transform, apply_transform, heikin_ashi
from app.models.bars import BarFrame


def _frame(rows: list[tuple[float, float, float, float]]) -> BarFrame:
    o, h, lo, c = (list(col) for col in zip(*rows, strict=True))
    return BarFrame.from_columns(
        time=[86_400 * i for i in range(len(rows))], open=o, high=h, low=lo, close=c,
        volume=[10.0 * (i + 1) for i in range(len(rows))],
    )  # fmt: skip


def test_hand_vector() -> None:
    frame = _frame([(10, 14, 9, 12), (12, 15, 11, 14), (14, 14, 8, 9)])
    ha = heikin_ashi(frame)
    # close = OHLC/4; open_0 = (O0+C0)/2; open_t = (open_{t-1} + close_{t-1})/2
    np.testing.assert_allclose(ha.close, [11.25, 13.0, 11.25])
    np.testing.assert_allclose(ha.open, [11.0, 11.125, 12.0625])
    np.testing.assert_allclose(ha.high, [14.0, 15.0, 14.0])
    np.testing.assert_allclose(ha.low, [9.0, 11.0, 8.0])
    np.testing.assert_array_equal(ha.time, frame.time)
    np.testing.assert_array_equal(ha.volume, frame.volume)
    np.testing.assert_array_equal(ha.adj_close, ha.close)


def test_empty_and_identity() -> None:
    assert len(heikin_ashi(BarFrame.empty())) == 0
    frame = _frame([(1, 2, 0.5, 1.5)])
    assert apply_transform(frame, Transform.NONE) is frame
    assert apply_transform(frame, Transform.HEIKIN_ASHI).close[0] == pytest.approx(1.25)


@st.composite
def ohlc_frames(draw: st.DrawFn) -> BarFrame:
    n = draw(st.integers(min_value=1, max_value=60))
    rows: list[tuple[float, float, float, float]] = []
    for _ in range(n):
        o, c = draw(st.floats(1, 1000)), draw(st.floats(1, 1000))
        h = max(o, c) + draw(st.floats(0, 50))
        lo = max(min(o, c) - draw(st.floats(0, 50)), 0.01)
        rows.append((o, h, lo, c))
    return _frame(rows)


@given(ohlc_frames())
def test_bars_stay_valid_and_bracket_the_raw_range(frame: BarFrame) -> None:
    ha = heikin_ashi(frame)
    assert np.all(ha.high >= np.maximum(ha.open, ha.close))
    assert np.all(ha.low <= np.minimum(ha.open, ha.close))
    assert np.all(ha.high >= frame.high)
    assert np.all(ha.low <= frame.low)


@given(ohlc_frames(), st.data())
def test_no_lookahead(frame: BarFrame, data: st.DataObject) -> None:
    k = data.draw(st.integers(min_value=0, max_value=len(frame) - 1))
    full = heikin_ashi(frame)
    prefix = heikin_ashi(frame.take(slice(0, k + 1)))
    for name in ("open", "high", "low", "close"):
        assert getattr(prefix, name)[k] == getattr(full, name)[k]
