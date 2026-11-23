"""RSI: hand vectors, Pine's edge-case order, smoothing and bands, warm-up."""

from __future__ import annotations

import numpy as np
import pytest

from app.indicators.catalog import CATALOG
from app.indicators.ma import MA_TYPES
from app.indicators.registry import InvalidParamsError
from tests.unit.indicators.test_composites import arr, frame_of

NAN = np.nan
RSI = CATALOG["rsi"]


def test_hand_vector() -> None:
    # changes 1, 1, -1, 2; RMA_2 of gains: 1, 0.5, 1.25; of losses: 0, 0.5, 0.25
    out = RSI.run(frame_of(arr(1, 2, 3, 2, 4)), {"length": 2})
    np.testing.assert_allclose(out["rsi"], arr(NAN, NAN, 100, 50, 100 - 100 / 6), equal_nan=True)


def test_pine_edge_cases() -> None:
    flat = RSI.run(frame_of(np.full(6, 5.0)), {"length": 3})["rsi"]
    np.testing.assert_array_equal(flat, arr(NAN, NAN, NAN, 100, 100, 100))  # no loss -> 100
    falling = RSI.run(frame_of(arr(5, 4, 3, 2)), {"length": 2})["rsi"]
    np.testing.assert_array_equal(falling, arr(NAN, NAN, 0, 0))
    rising = RSI.run(frame_of(arr(1, 2, 3)), {"length": 2})["rsi"]
    np.testing.assert_array_equal(rising, arr(NAN, NAN, 100))


def test_smoothing_off_leaves_the_optional_outputs_empty() -> None:
    out = RSI.run(frame_of(np.linspace(1, 9, 30)), {"bb": True})
    for name in ("rsi_ma", "bb_upper", "bb_lower"):
        assert np.isnan(out[name]).all()


def test_smoothing_and_bands_hand_vector() -> None:
    # RSI (nan, nan, 100, 50, 83.33); SMA_2: 75, 66.67; sigma_2: 25, 16.67
    params = {"length": 2, "ma_type": "sma", "ma_length": 2, "bb": True, "bb_mult": 2.0}
    out = RSI.run(frame_of(arr(1, 2, 3, 2, 4)), params)
    third = 100 - 100 / 6
    np.testing.assert_allclose(
        out["rsi_ma"], arr(NAN, NAN, NAN, 75, (50 + third) / 2), equal_nan=True
    )
    np.testing.assert_allclose(out["bb_upper"][3:], arr(125, out["rsi_ma"][4] + (third - 50)))
    np.testing.assert_allclose(out["bb_lower"][3:], arr(25, out["rsi_ma"][4] - (third - 50)))
    no_bands = RSI.run(frame_of(arr(1, 2, 3, 2, 4)), {**params, "bb": False})
    assert np.isnan(no_bands["bb_upper"]).all()


@pytest.mark.parametrize("ma_type", sorted(MA_TYPES))
@pytest.mark.parametrize("bb", [False, True])
def test_warmup_is_where_the_last_output_starts(ma_type: str, bb: bool) -> None:
    params = {"length": 5, "ma_type": ma_type, "ma_length": 4, "bb": bb}
    rng = np.random.default_rng(2)
    out = RSI.run(frame_of(100 + np.cumsum(rng.normal(0, 1, 200))), params)
    last = "bb_upper" if bb else "rsi_ma"
    assert int(np.flatnonzero(~np.isnan(out[last]))[0]) == RSI.warmup(params)


def test_options_and_lookback() -> None:
    ma_type = RSI.params[2]
    assert ma_type.options[0] == "none"
    assert ma_type.option_labels[:3] == ("None", "SMA", "EMA")
    assert len(ma_type.options) == 16
    assert RSI.levels == (70.0, 50.0, 30.0)
    assert RSI.level_fill == (30.0, 70.0)
    assert RSI.lookback(RSI.defaults()) == 350
    assert RSI.lookback({**RSI.defaults(), "ma_type": "ema"}) == 350 + 350
    with pytest.raises(InvalidParamsError, match="at least 2"):
        RSI.run(frame_of(arr(1, 2, 3)), {"ma_type": "hma", "ma_length": 1})
