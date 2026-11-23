"""Stochastic: hand vector and the flat-range (HH = LL) case."""

from __future__ import annotations

import numpy as np

from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame
from tests.unit.indicators.test_composites import arr

NAN = np.nan
STOCH = CATALOG["stoch"]


def bars(high: np.ndarray, low: np.ndarray, close: np.ndarray) -> BarFrame:
    return BarFrame.from_columns(
        time=np.arange(len(close)) * 86_400, open=close, high=high, low=low, close=close
    )


def test_hand_vector() -> None:
    # HH_2 (4, 5, 5), LL_2 (1, 2, 2): raw %K 100 * (3/3, 1/3, 0/3); %D = SMA_2
    frame = bars(arr(3, 4, 5, 4), arr(1, 2, 3, 2), arr(2, 4, 3, 2))
    out = STOCH.run(frame, {"k_length": 2, "k_smoothing": 1, "d_smoothing": 2})
    np.testing.assert_allclose(out["k"], arr(NAN, 100, 100 / 3, 0), equal_nan=True)
    np.testing.assert_allclose(out["d"], arr(NAN, NAN, 200 / 3, 50 / 3), equal_nan=True)


def test_flat_range_is_nan_and_poisons_the_averages_over_it() -> None:
    flat = np.full(5, 10.0)
    out = STOCH.run(bars(flat, flat, flat), {"k_length": 2, "k_smoothing": 1, "d_smoothing": 2})
    assert np.isnan(out["k"]).all()
    assert np.isnan(out["d"]).all()
    # One flat window in the middle (bars 2-3): %K is empty there, %K smoothing 2 one bar more.
    high, low = arr(5, 6, 6, 6, 8, 9), arr(1, 2, 6, 6, 4, 5)
    close = arr(3, 4, 6, 6, 7, 8)
    out = STOCH.run(bars(high, low, close), {"k_length": 2, "k_smoothing": 2, "d_smoothing": 1})
    np.testing.assert_array_equal(np.isnan(out["k"]), [1, 1, 0, 1, 1, 0])


def test_warmup_and_spec() -> None:
    assert STOCH.warmup(STOCH.defaults()) == 15
    assert STOCH.levels == (80.0, 50.0, 20.0)
    assert [o.label for o in STOCH.outputs] == ["%K", "%D"]


def test_lookback_covers_long_smoothings() -> None:
    """A window that starts ``lookback`` bars early gives the full-history values."""
    rng = np.random.default_rng(7)
    close = 100 + np.cumsum(rng.normal(size=1500))
    frame = bars(close + 1, close - 1, close)
    params = {"k_length": 14, "k_smoothing": 300, "d_smoothing": 300}
    first = 1200
    lo = first - STOCH.total_lookback(params)
    full = STOCH.run(frame, params)
    window = STOCH.run(frame.take(slice(lo, None)), params)
    for name in ("k", "d"):
        np.testing.assert_allclose(window[name][first - lo :], full[name][first:], rtol=1e-12)
