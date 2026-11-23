"""Property tests for every ``MA_TYPES`` entry and the MA composites (PLAN section 5.4, R3b)."""

from __future__ import annotations

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from app.indicators.catalog import CATALOG
from app.indicators.ma import MA_TYPES
from app.models.bars import BarFrame, FloatArray
from tests.golden.harness import check_no_lookahead

ALL_TYPES = sorted(MA_TYPES)
#: Shift-equivariant (unit DC gain, linear or ratio-of-differences) types; McGinley depends on
#: x / M and is only scale-equivariant.
SHIFT_EQUIVARIANT = [t for t in ALL_TYPES if t != "mcginley"]
#: Non-negative finite kernels: the output stays inside the window's range.
WINDOWED = ("sma", "wma", "alma", "swma", "vwma")

prices = st.integers(min_value=2, max_value=300).flatmap(
    lambda n: arrays(
        np.float64,
        n,
        elements=st.floats(min_value=1.0, max_value=1e4, allow_nan=False, allow_infinity=False),
    )
)
lengths = st.integers(min_value=1, max_value=40)


def frame_of(close: FloatArray, volume: FloatArray | None = None) -> BarFrame:
    return BarFrame.from_columns(
        time=np.arange(len(close)) * 86_400,
        open=close,
        high=close,
        low=close,
        close=close,
        volume=np.ones(len(close)) if volume is None else volume,
    )


def length_for(ma_type: str, length: int) -> int:
    return max(length, MA_TYPES[ma_type].min_length)


def ma(
    ma_type: str, close: FloatArray, length: int, volume: FloatArray | None = None
) -> FloatArray:
    params = {"ma_type": ma_type, "length": length_for(ma_type, length)}
    return CATALOG["ma"].run(frame_of(close, volume), params)["ma"]


@settings(max_examples=80, deadline=None)
@given(
    ma_type=st.sampled_from(ALL_TYPES),
    value=st.floats(1.0, 1e5),
    n_bars=st.integers(1, 300),
    length=lengths,
)
def test_constant_in_constant_out(ma_type: str, value: float, n_bars: int, length: int) -> None:
    y = ma(ma_type, np.full(n_bars, value), length)
    np.testing.assert_allclose(y[~np.isnan(y)], value, rtol=1e-11)


@settings(max_examples=80, deadline=None)
@given(
    ma_type=st.sampled_from(SHIFT_EQUIVARIANT),
    close=prices,
    length=lengths,
    scale=st.floats(0.01, 100.0),
    offset=st.floats(-1e3, 1e3),
)
def test_shift_and_scale_equivariance(
    ma_type: str, close: FloatArray, length: int, scale: float, offset: float
) -> None:
    """MA(a x + b) = a MA(x) + b (a > 0). KAMA's efficiency ratio is invariant under both."""
    left = ma(ma_type, scale * close + offset, length)
    right = scale * ma(ma_type, close, length) + offset
    tol = 1e-8 * (abs(offset) + scale * 1e4)
    np.testing.assert_allclose(left, right, rtol=1e-8, atol=tol)


@settings(max_examples=60, deadline=None)
@given(close=prices, length=lengths, scale=st.floats(0.01, 100.0))
def test_mcginley_scale_equivariance(close: FloatArray, length: int, scale: float) -> None:
    np.testing.assert_allclose(
        ma("mcginley", scale * close, length), scale * ma("mcginley", close, length), rtol=1e-9
    )


@settings(max_examples=60, deadline=None)
@given(
    close=prices,
    length=lengths,
    ma_type=st.sampled_from(WINDOWED),
    volume=st.floats(1.0, 1e6),
)
def test_windowed_mas_stay_inside_the_window_range(
    close: FloatArray, length: int, ma_type: str, volume: float
) -> None:
    n = 4 if ma_type == "swma" else length
    rng = np.random.default_rng(len(close))
    vol = volume * rng.uniform(0.1, 1.0, len(close))
    y = ma(ma_type, close, length, vol)
    for t in range(n - 1, len(close)):
        window = close[t - n + 1 : t + 1]
        assert window.min() * (1 - 1e-12) <= y[t] <= window.max() * (1 + 1e-12)


@settings(max_examples=60, deadline=None)
@given(close=prices, length=lengths)
def test_kama_moves_towards_the_new_value(close: FloatArray, length: int) -> None:
    """K_t = K_{t-1} + c (x_t - K_{t-1}) with c in (0, 1]: K_t lies between K_{t-1} and x_t."""
    y = ma("kama", close, length)
    for t in range(length + 1, len(close)):
        low, high = sorted((y[t - 1], close[t]))
        assert low - 1e-9 <= y[t] <= high + 1e-9


@settings(max_examples=40, deadline=None)
@given(data=st.data(), close=prices, length=lengths, ma_type=st.sampled_from(ALL_TYPES))
def test_no_lookahead_every_type(
    data: st.DataObject, close: FloatArray, length: int, ma_type: str
) -> None:
    ks = data.draw(st.lists(st.integers(0, len(close) - 1), min_size=1, max_size=4, unique=True))
    params = {"ma_type": ma_type, "length": length_for(ma_type, length), "offset": 1}
    check_no_lookahead(CATALOG["ma"], frame_of(close), params, ks)


@settings(max_examples=25, deadline=None)
@given(
    data=st.data(),
    close=prices,
    indicator=st.sampled_from(("alma", "kama", "t3", "lsma", "ma_cross", "ma_ribbon", "envelope")),
)
def test_no_lookahead_composites_and_inputs(
    data: st.DataObject, close: FloatArray, indicator: str
) -> None:
    ks = data.draw(st.lists(st.integers(0, len(close) - 1), min_size=1, max_size=4, unique=True))
    params = {
        "alma": {"length": 7, "alma_offset": 0.5, "sigma": 3.0},
        "kama": {"length": 5, "fast": 3, "slow": 20},
        "t3": {"length": 3, "factor": 0.5, "offset": 2},
        "lsma": {"length": 8, "offset": 3},
        "ma_cross": {"fast_type": "hma", "fast_length": 4, "slow_type": "ema", "slow_length": 9},
        "ma_ribbon": {"length_1": 2, "length_2": 5, "length_3": 8, "length_4": 13},
        "envelope": {"length": 6, "percent": 2.5, "ma_type": "wma"},
    }[indicator]
    check_no_lookahead(CATALOG[indicator], frame_of(close), params, ks)


@settings(max_examples=60, deadline=None)
@given(close=prices, fast=st.integers(1, 10), slow=st.integers(2, 30))
def test_crosses_mark_exactly_the_sign_changes(close: FloatArray, fast: int, slow: int) -> None:
    out = CATALOG["ma_cross"].run(frame_of(close), {"fast_length": fast, "slow_length": slow})
    diff = out["fast"] - out["slow"]
    for t in range(1, len(close)):
        before, now, mark = diff[t - 1], diff[t], out["crosses"][t]
        if np.isnan(before) or np.isnan(now):
            assert np.isnan(mark)
        elif now > 0 >= before:
            assert mark == 1.0
        elif now < 0 <= before:
            assert mark == -1.0
        else:
            assert np.isnan(mark)


@settings(max_examples=60, deadline=None)
@given(close=prices, length=lengths, percent=st.floats(0.0, 100.0))
def test_envelope_bands_are_a_fixed_ratio_of_the_basis(
    close: FloatArray, length: int, percent: float
) -> None:
    out = CATALOG["envelope"].run(frame_of(close), {"length": length, "percent": percent})
    np.testing.assert_allclose(out["basis"], ma("sma", close, length), equal_nan=True)
    np.testing.assert_allclose(out["upper"], out["basis"] * (1 + percent / 100), equal_nan=True)
    np.testing.assert_allclose(out["lower"], out["basis"] * (1 - percent / 100), equal_nan=True)
