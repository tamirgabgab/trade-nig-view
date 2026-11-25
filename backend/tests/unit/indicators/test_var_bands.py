"""VaR bands: the bands forecast the next bar, a crash below them is marked, defaults."""

from __future__ import annotations

import math

import numpy as np

from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame

BANDS = CATALOG["var_bands"]


def test_a_crash_after_calm_bars_breaks_the_lower_band() -> None:
    # 120 calm bars alternating +-1 %, then a -10 % bar.
    n = 121
    steps = np.where(np.arange(n) % 2 == 0, 0.01, -0.01)
    steps[-1] = -0.10
    close = 100 * np.exp(np.cumsum(steps))
    frame = BarFrame.from_columns(
        time=np.arange(n) * 86_400,
        open=close,
        high=close * 1.005,
        low=close * 0.995,
        close=close,
    )
    out = BANDS.run(frame, {"level": "99", "window": 50, "length": 5})
    warm = BANDS.warmup({"level": "99", "window": 50, "length": 5})
    assert warm == 56
    assert np.isnan(out["upper"][:warm]).all()
    assert (out["lower"][warm:] < out["upper"][warm:]).all()
    assert out["breaches"][-1] == -1
    assert np.isnan(out["breaches"][warm:-1]).all()
    # The last band is the one made at the previous close: within a few % of it.
    assert out["lower"][-1] / close[-2] > math.exp(-0.06)


def test_defaults() -> None:
    assert BANDS.defaults() == {"level": "95", "window": 500, "length": 21}
    assert BANDS.total_lookback(BANDS.defaults()) == 500 + 21 + 2 + 1
    assert [o.name for o in BANDS.outputs] == ["upper", "lower", "breaches"]
