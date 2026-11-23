"""MACD: hand vector, defaults' warm-up, signal seeded on the first MACD values."""

from __future__ import annotations

import numpy as np

from app.indicators import core
from app.indicators.catalog import CATALOG
from tests.unit.indicators.test_composites import arr, frame_of

NAN = np.nan
MACD = CATALOG["macd"]


def test_hand_vector_with_smas() -> None:
    # fast = x, slow = SMA_2 (nan, 1.5, 3, 5.5): MACD (nan, .5, 1, 1.5); signal SMA_2 (.75, 1.25)
    params = {
        "fast_length": 1,
        "slow_length": 2,
        "signal_length": 2,
        "osc_ma_type": "sma",
        "signal_ma_type": "sma",
    }
    out = MACD.run(frame_of(arr(1, 2, 4, 7)), params)
    np.testing.assert_allclose(out["macd"], arr(NAN, 0.5, 1, 1.5), equal_nan=True)
    np.testing.assert_allclose(out["signal"], arr(NAN, NAN, 0.75, 1.25), equal_nan=True)
    np.testing.assert_allclose(out["hist"], arr(NAN, NAN, 0.25, 0.25), equal_nan=True)
    assert list(out) == ["hist", "macd", "signal"]


def test_defaults_warm_up_at_25_and_33() -> None:
    rng = np.random.default_rng(4)
    x = 100 + np.cumsum(rng.normal(0, 1, 200))
    out = MACD.run(frame_of(x), {})
    assert core.first_valid(out["macd"]) == 25
    assert core.first_valid(out["signal"]) == core.first_valid(out["hist"]) == 33
    assert MACD.warmup(MACD.defaults()) == 33
    # The signal EMA is seeded with the SMA of the first 9 MACD values.
    assert out["signal"][33] == np.mean(out["macd"][25:34])


def test_constant_price_gives_zero() -> None:
    out = MACD.run(frame_of(np.full(60, 42.0)), {})
    for name in ("macd", "signal", "hist"):
        np.testing.assert_allclose(out[name][33:], 0.0, atol=1e-12)


def test_spec_contract() -> None:
    assert not MACD.overlay
    assert MACD.levels == (0.0,)
    hist = MACD.outputs[0]
    assert hist.plot == "histogram"
    assert set(hist.style) == {"up", "up_weak", "down", "down_weak"}
    assert MACD.lookback(MACD.defaults()) == 650 + 250
