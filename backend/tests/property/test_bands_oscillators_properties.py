"""Property tests for the R3c set: bounds, invariants and no lookahead on generated OHLCV bars."""

from __future__ import annotations

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from app.indicators import core
from app.indicators.catalog import CATALOG
from app.indicators.ma import MA_TYPES
from app.models.bars import BarFrame, FloatArray
from tests.golden.harness import check_no_lookahead

ALL_TYPES = sorted(MA_TYPES)


@st.composite
def bars(draw: st.DrawFn, min_size: int = 2, max_size: int = 250) -> BarFrame:
    """Valid OHLCV bars (low <= open, close <= high; volume >= 0, sometimes 0) in sessions of 1 to
    10 bars; flat stretches are likely, so the edge cases (HH = LL, zero changes) are hit."""
    n = draw(st.integers(min_size, max_size))
    level = st.floats(1.0, 1e4, allow_nan=False, allow_infinity=False)
    close = draw(arrays(np.float64, n, elements=level))
    if draw(st.booleans()):  # a random walk with exact repeats instead of independent levels
        steps = draw(arrays(np.float64, n, elements=st.sampled_from([-1.0, 0.0, 0.0, 0.5, 2.0])))
        close = 100.0 + np.cumsum(steps)
    up = draw(arrays(np.float64, n, elements=st.floats(0.0, 5.0)))
    down = draw(arrays(np.float64, n, elements=st.floats(0.0, 5.0)))
    where = draw(arrays(np.float64, n, elements=st.floats(0.0, 1.0)))
    volume = draw(arrays(np.float64, n, elements=st.sampled_from([0.0, 1.0, 250.0, 1e6])))
    high, low = close + up, close - down
    session = np.cumsum(draw(arrays(np.int64, n, elements=st.integers(0, 9))) == 0).astype(np.int64)
    return BarFrame.from_columns(
        time=np.arange(n) * 3_600,
        open=low + where * (high - low),
        high=high,
        low=low,
        close=close,
        volume=volume,
    ).with_session(session)


def _ks(data: st.DataObject, frame: BarFrame) -> list[int]:
    return data.draw(st.lists(st.integers(0, len(frame) - 1), min_size=1, max_size=4, unique=True))


PARAMS: dict[str, dict[str, object]] = {
    "bb": {"length": 5, "mult": 2.0, "offset": 2, "ma_type": "ema"},
    "rsi": {"length": 3, "ma_type": "wma", "ma_length": 4, "bb": True},
    "macd": {"fast_length": 3, "slow_length": 7, "signal_length": 4},
    "stoch": {"k_length": 5, "k_smoothing": 2, "d_smoothing": 3},
    "atr": {"length": 4},
    "obv": {},
    "vwap": {"source": "hlc3"},
    "vol_sma": {"length": 3},
}


@settings(max_examples=40, deadline=None)
@given(data=st.data(), frame=bars(), indicator=st.sampled_from(sorted(PARAMS)))
def test_no_lookahead(data: st.DataObject, frame: BarFrame, indicator: str) -> None:
    check_no_lookahead(CATALOG[indicator], frame, PARAMS[indicator], _ks(data, frame))


@settings(max_examples=30, deadline=None)
@given(data=st.data(), frame=bars(), ma_type=st.sampled_from(ALL_TYPES))
def test_no_lookahead_for_every_signal_and_smoothing_type(
    data: st.DataObject, frame: BarFrame, ma_type: str
) -> None:
    n = max(3, MA_TYPES[ma_type].min_length)
    ks = _ks(data, frame)
    macd = {"fast_length": 2, "slow_length": 5, "signal_length": n, "signal_ma_type": ma_type}
    check_no_lookahead(CATALOG["macd"], frame, macd, ks)
    rsi = {"length": 2, "ma_type": ma_type, "ma_length": n, "bb": True}
    check_no_lookahead(CATALOG["rsi"], frame, rsi, ks)
    check_no_lookahead(CATALOG["bb"], frame, {"length": n, "ma_type": ma_type}, ks)


@settings(max_examples=60, deadline=None)
@given(frame=bars(), length=st.integers(1, 30), ma_type=st.sampled_from(ALL_TYPES))
def test_bb_upper_basis_lower_are_ordered(frame: BarFrame, length: int, ma_type: str) -> None:
    length = max(length, MA_TYPES[ma_type].min_length)
    out = CATALOG["bb"].run(frame, {"length": length, "ma_type": ma_type})
    ok = ~np.isnan(out["upper"])
    assert (out["upper"][ok] >= out["basis"][ok]).all()
    assert (out["basis"][ok] >= out["lower"][ok]).all()


@settings(max_examples=60, deadline=None)
@given(
    x=arrays(np.float64, st.integers(1, 200), elements=st.floats(-1e4, 1e4)), n=st.integers(1, 30)
)
def test_stdev_is_shift_invariant_scale_equivariant_and_non_negative(x: FloatArray, n: int) -> None:
    sigma = core.stdev(x, n)
    ok = ~np.isnan(sigma)
    assert (sigma[ok] >= 0).all()
    # Rounding of the window mean leaves ~1e-16 x the magnitude even on a constant window.
    tol = 1e-12 * (np.abs(x).max() + 1234.5)
    np.testing.assert_allclose(core.stdev(x + 1234.5, n), sigma, rtol=1e-9, atol=tol)
    np.testing.assert_allclose(core.stdev(-3.0 * x, n), 3.0 * sigma, rtol=1e-9, atol=3 * tol)


@settings(max_examples=60, deadline=None)
@given(frame=bars(), length=st.integers(1, 30))
def test_rsi_stays_in_0_to_100(frame: BarFrame, length: int) -> None:
    out = CATALOG["rsi"].run(frame, {"length": length, "ma_type": "sma", "ma_length": 5})
    for name in ("rsi", "rsi_ma"):
        values = out[name][~np.isnan(out[name])]
        assert ((values >= 0.0) & (values <= 100.0)).all(), name


@settings(max_examples=60, deadline=None)
@given(frame=bars(), n=st.integers(1, 20), sk=st.integers(1, 5), sd=st.integers(1, 5))
def test_stoch_stays_in_0_to_100(frame: BarFrame, n: int, sk: int, sd: int) -> None:
    out = CATALOG["stoch"].run(frame, {"k_length": n, "k_smoothing": sk, "d_smoothing": sd})
    for name in ("k", "d"):
        values = out[name][~np.isnan(out[name])]
        assert ((values >= -1e-9) & (values <= 100.0 + 1e-9)).all(), name


@settings(max_examples=60, deadline=None)
@given(
    frame=bars(), length=st.integers(1, 30), smoothing=st.sampled_from(["rma", "sma", "ema", "wma"])
)
def test_atr_is_non_negative(frame: BarFrame, length: int, smoothing: str) -> None:
    atr = CATALOG["atr"].run(frame, {"length": length, "ma_type": smoothing})["atr"]
    assert (atr[~np.isnan(atr)] >= 0.0).all()


@settings(max_examples=60, deadline=None)
@given(frame=bars())
def test_obv_increments_are_plus_minus_or_zero_volume(frame: BarFrame) -> None:
    obv = CATALOG["obv"].run(frame)["obv"]
    assert obv[0] == 0.0
    step = np.diff(obv)
    v = frame.volume[1:]
    assert (np.isclose(step, v) | np.isclose(step, -v) | (step == 0.0)).all()
    np.testing.assert_array_equal(np.sign(step), np.sign(np.diff(frame.close)) * (v > 0))


@settings(max_examples=60, deadline=None)
@given(frame=bars())
def test_vwap_stays_inside_the_session_range(frame: BarFrame) -> None:
    vwap = CATALOG["vwap"].run(frame)["vwap"]
    assert frame.session is not None
    first = 0
    for t in range(len(frame)):
        if t > 0 and frame.session[t] != frame.session[t - 1]:
            first = t
        if np.isnan(vwap[t]):
            assert frame.volume[first : t + 1].sum() == 0.0
            continue
        low, high = frame.low[first : t + 1].min(), frame.high[first : t + 1].max()
        # Relative slack that also holds for negative prices.
        assert low - 1e-12 * abs(low) <= vwap[t] <= high + 1e-12 * abs(high)


@settings(max_examples=40, deadline=None)
@given(frame=bars(), length=st.integers(1, 30))
def test_vol_sma_is_the_sma_of_volume(frame: BarFrame, length: int) -> None:
    out = CATALOG["vol_sma"].run(frame, {"length": length})["ma"]
    np.testing.assert_array_equal(out, core.sma(frame.volume, length))
    assert (out[~np.isnan(out)] >= 0.0).all()


@settings(max_examples=40, deadline=None)
@given(frame=bars(), osc=st.sampled_from(ALL_TYPES))
def test_macd_histogram_is_macd_minus_signal(frame: BarFrame, osc: str) -> None:
    params = {"fast_length": 3, "slow_length": 6, "signal_length": 3, "osc_ma_type": osc}
    out = CATALOG["macd"].run(frame, params)
    np.testing.assert_array_equal(out["hist"], out["macd"] - out["signal"])
