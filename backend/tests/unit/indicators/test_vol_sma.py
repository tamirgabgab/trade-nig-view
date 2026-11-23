"""Volume SMA: hand vector and the volume price-scale style."""

from __future__ import annotations

import numpy as np

from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame
from tests.unit.indicators.test_composites import arr

VOL_SMA = CATALOG["vol_sma"]


def test_hand_vector_and_spec() -> None:
    close = arr(5, 5, 5, 5)
    frame = BarFrame.from_columns(
        time=np.arange(4) * 86_400,
        open=close,
        high=close,
        low=close,
        close=close,
        volume=arr(1, 2, 3, 4),
    )
    out = VOL_SMA.run(frame, {"length": 2})["ma"]
    np.testing.assert_allclose(out, arr(np.nan, 1.5, 2.5, 3.5), equal_nan=True)
    assert VOL_SMA.inputs == ("volume",)
    assert VOL_SMA.outputs[0].style == {"price_scale": "volume"}
    assert VOL_SMA.warmup(VOL_SMA.defaults()) == 19
