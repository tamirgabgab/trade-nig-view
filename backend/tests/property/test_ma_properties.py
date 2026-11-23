"""Property tests for the core moving averages (PLAN section 5.4, non-negative kernels)."""

from __future__ import annotations

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame, FloatArray
from tests.golden.harness import check_no_lookahead

MA_IDS = ("sma", "ema", "wma", "smma")

prices = st.integers(min_value=1, max_value=400).flatmap(
    lambda n: arrays(
        np.float64,
        n,
        elements=st.floats(min_value=1.0, max_value=1e4, allow_nan=False, allow_infinity=False),
    )
)
lengths = st.integers(min_value=1, max_value=60)
ma_ids = st.sampled_from(MA_IDS)


def frame_of(close: FloatArray) -> BarFrame:
    return BarFrame.from_columns(
        time=np.arange(len(close)) * 86_400,
        open=close,
        high=close,
        low=close,
        close=close,
        volume=np.ones(len(close)),
    )


def ma(indicator: str, close: FloatArray, length: int) -> FloatArray:
    return CATALOG[indicator].run(frame_of(close), {"length": length})["ma"]


@settings(max_examples=60, deadline=None)
@given(indicator=ma_ids, value=st.floats(1.0, 1e5), n_bars=st.integers(1, 300), length=lengths)
def test_constant_in_constant_out(indicator: str, value: float, n_bars: int, length: int) -> None:
    y = ma(indicator, np.full(n_bars, value), length)
    valid = y[~np.isnan(y)]
    np.testing.assert_allclose(valid, value, rtol=1e-12)


@settings(max_examples=60, deadline=None)
@given(
    indicator=ma_ids,
    close=prices,
    length=lengths,
    scale=st.floats(0.01, 100.0),
    offset=st.floats(-1e3, 1e3),
)
def test_shift_and_scale_equivariance(
    indicator: str, close: FloatArray, length: int, scale: float, offset: float
) -> None:
    """MA(a x + b) = a MA(x) + b for linear MAs (unit DC gain)."""
    left = ma(indicator, scale * close + offset, length)
    right = scale * ma(indicator, close, length) + offset
    np.testing.assert_allclose(left, right, rtol=1e-9, atol=1e-9 * (abs(offset) + scale * 1e4))


@settings(max_examples=60, deadline=None)
@given(close=prices, length=lengths, indicator=st.sampled_from(("sma", "wma")))
def test_fir_stays_inside_the_window_range(close: FloatArray, length: int, indicator: str) -> None:
    """Non-negative finite kernels: min(window) <= y_t <= max(window)."""
    y = ma(indicator, close, length)
    for t in range(length - 1, len(close)):
        window = close[t - length + 1 : t + 1]
        assert window.min() - 1e-9 <= y[t] <= window.max() + 1e-9


@settings(max_examples=60, deadline=None)
@given(close=prices, length=lengths, indicator=st.sampled_from(("ema", "smma")))
def test_iir_moves_towards_the_new_value(close: FloatArray, length: int, indicator: str) -> None:
    """y_t lies between y_{t-1} and x_t (a convex combination, alpha in (0, 1])."""
    y = ma(indicator, close, length)
    for t in range(length, len(close)):
        low, high = sorted((y[t - 1], close[t]))
        assert low - 1e-9 <= y[t] <= high + 1e-9


@settings(max_examples=40, deadline=None)
@given(data=st.data(), close=prices, length=lengths, indicator=ma_ids)
def test_no_lookahead(data: st.DataObject, close: FloatArray, length: int, indicator: str) -> None:
    ks = data.draw(
        st.lists(st.integers(0, len(close) - 1), min_size=1, max_size=5, unique=True), label="k"
    )
    check_no_lookahead(
        CATALOG[indicator], frame_of(close), {"length": length, "source": "hlc3"}, ks
    )
