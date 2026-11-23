"""``apply_ma_valid``: every MA type on a series that starts with ``NaN`` (signal lines, RSI
smoothing) is seeded on the first valid values, as on a fresh series."""

from __future__ import annotations

import numpy as np
import pytest

from app.indicators import core
from app.indicators.ma import MA_TYPES, apply_ma, apply_ma_valid, ma_warmup


@pytest.mark.parametrize("ma_type", sorted(MA_TYPES))
@pytest.mark.parametrize("pad", [0, 1, 17])
def test_every_type_starts_on_the_first_valid_value(ma_type: str, pad: int) -> None:
    rng = np.random.default_rng(5)
    x = 100 + np.cumsum(rng.normal(0, 1, 300))
    volume = rng.uniform(1, 2, 300 + pad)
    n = max(6, MA_TYPES[ma_type].min_length)
    padded = np.concatenate([np.full(pad, np.nan), x])
    out = apply_ma_valid(ma_type, padded, n, volume)
    np.testing.assert_array_equal(out[:pad], np.full(pad, np.nan))
    np.testing.assert_array_equal(out[pad:], apply_ma(ma_type, x, n, volume[pad:]))
    assert core.first_valid(out) == pad + ma_warmup(ma_type, n)


@pytest.mark.parametrize("ma_type", sorted(MA_TYPES))
def test_all_nan_and_empty_inputs(ma_type: str) -> None:
    n = MA_TYPES[ma_type].min_length
    assert np.isnan(apply_ma_valid(ma_type, np.full(5, np.nan), n, np.ones(5))).all()
    assert len(apply_ma_valid(ma_type, np.empty(0), n, np.empty(0))) == 0
