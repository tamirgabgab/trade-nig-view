"""ATR: hand vectors for the smoothing options, TR_0 = H_0 - L_0."""

from __future__ import annotations

import numpy as np
import pytest

from app.indicators.catalog import CATALOG
from app.indicators.registry import InvalidParamsError
from tests.unit.indicators.test_composites import arr
from tests.unit.indicators.test_stoch import bars

NAN = np.nan
ATR = CATALOG["atr"]
FRAME = bars(arr(10, 12, 11), arr(8, 9, 7), arr(9, 11, 8))  # TR (2, 3, 4)


@pytest.mark.parametrize(
    ("smoothing", "expected"),
    [
        ("rma", (NAN, 2.5, 3.25)),  # seed mean(2, 3), then 2.5 + (4 - 2.5) / 2
        ("sma", (NAN, 2.5, 3.5)),
        ("ema", (NAN, 2.5, 2.5 + 2 / 3 * 1.5)),
        ("wma", (NAN, 8 / 3, 11 / 3)),
    ],
)
def test_hand_vectors(smoothing: str, expected: tuple[float, ...]) -> None:
    out = ATR.run(FRAME, {"length": 2, "ma_type": smoothing})["atr"]
    np.testing.assert_allclose(out, arr(*expected), equal_nan=True)


def test_options_and_defaults() -> None:
    smoothing = ATR.params[1]
    assert smoothing.options == ("rma", "sma", "ema", "wma")
    assert smoothing.option_labels == ("SMMA (RMA)", "SMA", "EMA", "WMA")
    assert ATR.defaults() == {"length": 14, "ma_type": "rma"}
    assert ATR.warmup(ATR.defaults()) == 13
    with pytest.raises(InvalidParamsError, match="one of"):
        ATR.run(FRAME, {"ma_type": "smma"})
