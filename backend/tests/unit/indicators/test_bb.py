"""Bollinger Bands: hand vectors, sigma about the SMA for any basis, offset, warm-up."""

from __future__ import annotations

import numpy as np
import pytest

from app.indicators.catalog import CATALOG
from tests.unit.indicators.test_composites import arr, frame_of

NAN = np.nan
BB = CATALOG["bb"]


def test_sma_basis_hand_vector() -> None:
    # windows (1, 2), (2, 3), (3, 4): mean +- 2 * 0.5
    out = BB.run(frame_of(arr(1, 2, 3, 4)), {"length": 2})
    np.testing.assert_allclose(out["basis"], arr(NAN, 1.5, 2.5, 3.5), equal_nan=True)
    np.testing.assert_allclose(out["upper"], arr(NAN, 2.5, 3.5, 4.5), equal_nan=True)
    np.testing.assert_allclose(out["lower"], arr(NAN, 0.5, 1.5, 2.5), equal_nan=True)
    assert list(out) == ["basis", "upper", "lower"]


def test_sigma_is_about_the_sma_whatever_the_basis() -> None:
    # EMA_2 (alpha 2/3) of (1, 3, 9): seed 2, then 2 + 2/3 * 7 = 20/3. sigma of (3, 9) about
    # its mean 6 is 3 (about the EMA it would be 3.07).
    out = BB.run(frame_of(arr(1, 3, 9)), {"length": 2, "ma_type": "ema", "mult": 1.0})
    assert out["basis"][2] == pytest.approx(20 / 3, abs=1e-12)
    assert out["upper"][2] - out["basis"][2] == pytest.approx(3.0, abs=1e-12)


def test_constant_price_collapses_the_bands_and_offset_shifts_all_lines() -> None:
    out = BB.run(frame_of(np.full(6, 7.0)), {"length": 3, "offset": 2})
    for name in ("basis", "upper", "lower"):
        np.testing.assert_allclose(out[name], arr(NAN, NAN, NAN, NAN, 7, 7), equal_nan=True)


@pytest.mark.parametrize(
    ("ma_type", "warmup"), [("sma", 9), ("swma", 9), ("dema", 18), ("kama", 10)]
)
def test_warmup_is_the_later_of_basis_and_sigma(ma_type: str, warmup: int) -> None:
    params = {**BB.defaults(), "length": 10, "ma_type": ma_type}
    assert BB.warmup(params) == warmup
    out = BB.run(frame_of(np.linspace(1, 50, 60)), params)
    assert int(np.flatnonzero(~np.isnan(out["upper"]))[0]) == warmup


def test_spec_contract() -> None:
    assert BB.overlay
    assert BB.outputs[1].style == {"fill_to": "lower", "fill": "rgba(33, 150, 243, 0.08)"}
    assert BB.defaults() == {
        "length": 20,
        "ma_type": "sma",
        "source": "close",
        "mult": 2.0,
        "offset": 0,
    }
    assert BB.total_lookback({**BB.defaults(), "offset": 5}) == 500 + 5
