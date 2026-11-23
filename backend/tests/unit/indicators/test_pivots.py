"""Pivot points: hand vectors (strict both sides, confirmation R bars later) and the shift."""

from __future__ import annotations

import numpy as np

from app.indicators.catalog import CATALOG
from app.indicators.pivots import confirmed_pivots
from app.models.bars import BarFrame
from tests.unit.indicators.test_composites import arr

NAN = np.nan
PIVOTS = CATALOG["pivots"]


def test_pivot_high_is_stored_at_its_confirmation_bar() -> None:
    #              0  1  2  3  4  5  6
    high = arr(1, 2, 5, 3, 2, 6, 1)
    # L=2, R=2: bar 2 (5 > 1, 2 and > 3, 2) confirmed at bar 4; bar 5 lacks two right bars
    np.testing.assert_array_equal(
        confirmed_pivots(high, 2, 2, 1.0), arr(NAN, NAN, NAN, NAN, 5, NAN, NAN)
    )


def test_ties_are_not_pivots() -> None:
    np.testing.assert_array_equal(
        confirmed_pivots(arr(1, 5, 5, 1, 1), 1, 1, 1.0), arr(NAN, NAN, NAN, NAN, NAN)
    )
    np.testing.assert_array_equal(
        confirmed_pivots(arr(3, 1, 1, 3), 1, 1, -1.0), arr(NAN, NAN, NAN, NAN)
    )


def test_needs_left_bars() -> None:
    # bar 0 is the highest but has no left bars; bar 1 is not above bar 0
    np.testing.assert_array_equal(confirmed_pivots(arr(9, 2, 1), 1, 1, 1.0), arr(NAN, NAN, NAN))
    assert np.isnan(confirmed_pivots(arr(1, 2), 1, 1, 1.0)).all()


def test_highs_and_lows_with_asymmetric_sides() -> None:
    high = arr(4, 5, 6, 9, 7, 8, 3, 2)
    low = arr(3, 2, 1, 4, 5, 2, 1.5, 0.5)
    lows = arr(5, 4, 3, 1, 2, 6, 0.5, 1)
    bars = BarFrame.from_columns(
        time=np.arange(8) * 86_400, open=low, high=high, low=low, close=low
    )
    out = PIVOTS.run(bars, {"left": 3, "right": 1})
    # high: bar 3 (9 > 4, 5, 6 and > 7) confirmed at 4; bar 5 (8 > 6? no, 9 is in its left side)
    np.testing.assert_array_equal(out["high"], arr(NAN, NAN, NAN, NAN, 9, NAN, NAN, NAN))
    # low: bar 2 has only 2 left bars; bar 6 (1.5) is not below bar 7 (0.5); none confirmed
    np.testing.assert_array_equal(out["low"], arr(*[NAN] * 8))
    # bar 3 (1 < 5, 4, 3 and < 2) confirmed at 4; bar 6 (0.5 < 1, 2, 6 and < 1) confirmed at 7
    np.testing.assert_array_equal(
        confirmed_pivots(lows, 3, 1, -1.0), arr(NAN, NAN, NAN, NAN, 1, NAN, NAN, 0.5)
    )


def test_spec_contract() -> None:
    assert PIVOTS.defaults() == {"left": 5, "right": 5}
    assert PIVOTS.display_shift({"left": 2, "right": 7}) == 7
    assert PIVOTS.warmup({"left": 2, "right": 7}) == 9
    assert [o.plot for o in PIVOTS.outputs] == ["markers", "markers"]
    assert PIVOTS.outputs[0].style == {"shape": "circle", "position": "above"}
    assert PIVOTS.outputs[1].style == {"shape": "circle", "position": "below"}
