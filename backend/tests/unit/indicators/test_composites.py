"""Directed tests of the MA composites: hand vectors for crossings, bands and the ribbon."""

from __future__ import annotations

import numpy as np

from app.indicators.catalog import CATALOG
from app.indicators.ma_cross import crossings
from app.models.bars import BarFrame

NAN = np.nan


def arr(*values: float) -> np.ndarray:
    return np.array(values, dtype=np.float64)


def frame_of(close: np.ndarray) -> BarFrame:
    return BarFrame.from_columns(
        time=np.arange(len(close)) * 86_400,
        open=close,
        high=close,
        low=close,
        close=close,
        volume=np.ones(len(close)),
    )


def test_crossings_hand_vector() -> None:
    # fast - slow = [nan, -1, 1, 1, -1, 0, 1]: up at 2, down at 4, touch at 5, up again at 6
    fast = arr(NAN, 1, 3, 3, 1, 2, 3)
    slow = arr(2, 2, 2, 2, 2, 2, 2)
    np.testing.assert_array_equal(crossings(fast, slow), arr(NAN, NAN, 1, NAN, -1, NAN, 1))


def test_touching_and_leaving_on_the_same_side_counts_as_a_cross() -> None:
    """Pine semantics: ``ta.crossunder`` is ``a < b and a[1] >= b[1]``, so -1, 0, -1 marks a
    cross down at the third bar."""
    np.testing.assert_array_equal(crossings(arr(1, 2, 1), arr(2, 2, 2)), arr(NAN, NAN, -1))


def test_ma_cross_with_sma_1_and_sma_2() -> None:
    # fast = x; slow = SMA_2 = [nan, 1.5, 2.5, 2.5, 1.5]; diff = [nan, .5, .5, -.5, -.5]
    out = CATALOG["ma_cross"].run(
        frame_of(arr(1, 2, 3, 2, 1)),
        {"fast_length": 1, "slow_length": 2},
    )
    np.testing.assert_allclose(out["slow"], arr(NAN, 1.5, 2.5, 2.5, 1.5), equal_nan=True)
    np.testing.assert_array_equal(out["crosses"], arr(NAN, NAN, NAN, -1, NAN))


def test_envelope_hand_vector() -> None:
    out = CATALOG["envelope"].run(frame_of(arr(10, 20, 30)), {"length": 2, "percent": 10.0})
    np.testing.assert_allclose(out["basis"], arr(NAN, 15, 25), equal_nan=True)
    np.testing.assert_allclose(out["upper"], arr(NAN, 16.5, 27.5), equal_nan=True)
    np.testing.assert_allclose(out["lower"], arr(NAN, 13.5, 22.5), equal_nan=True)


def test_ribbon_hand_vector() -> None:
    params = {"ma_type": "sma", "length_1": 1, "length_2": 2, "length_3": 3, "length_4": 4}
    out = CATALOG["ma_ribbon"].run(frame_of(arr(1, 2, 3, 4)), params)
    np.testing.assert_allclose(out["ma_1"], arr(1, 2, 3, 4))
    np.testing.assert_allclose(out["ma_2"], arr(NAN, 1.5, 2.5, 3.5), equal_nan=True)
    np.testing.assert_allclose(out["ma_3"], arr(NAN, NAN, 2, 3), equal_nan=True)
    np.testing.assert_allclose(out["ma_4"], arr(NAN, NAN, NAN, 2.5), equal_nan=True)


def test_composite_warmup_is_the_slowest_output() -> None:
    """``warmup`` belongs to the output that starts last; faster outputs start earlier."""
    spec = CATALOG["ma_cross"]
    params = spec.defaults()
    out = spec.run(frame_of(np.linspace(1, 50, 60)), params)
    assert spec.warmup(params) == 20
    assert int(np.flatnonzero(~np.isnan(out["slow"]))[0]) == 20
    assert int(np.flatnonzero(~np.isnan(out["fast"]))[0]) == 8
