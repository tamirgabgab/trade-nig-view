r"""Market regime as the chart's background: trending, random or mean-reverting over the last W
bars, by the Chow-Denning Variance Ratio test (``variance_ratio``) at 5 %.

.. math::
    \text{regime}_t = \begin{cases}
    +1 & z_t \ge 2.49 \ \text{(trend)} \\
    -1 & z_t \le -2.49 \ \text{(mean reversion)} \\
    0 & \text{otherwise (no evidence: random)}
    \end{cases}

with :math:`z_t` the signed :math:`\max_q |z^*(q)|`. Drawn as a tint behind the bars (+1 in the
trend colour, -1 in the reversion colour). Warm-up: W bars.
"""

from __future__ import annotations

import numpy as np

from app.indicators import variance_ratio
from app.indicators.ma import length_param
from app.indicators.registry import MIN_LOOKBACK, IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def label(z: FloatArray) -> FloatArray:
    out = np.where(z >= variance_ratio.CRITICAL, 1.0, 0.0)
    out = np.where(z <= -variance_ratio.CRITICAL, -1.0, out)
    return np.where(np.isnan(z), np.nan, out)


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    return {"regime": label(variance_ratio.rolling_z(frame, int(params["length"])))}


SPEC = IndicatorSpec(
    id="regime",
    version=1,
    name="Market Regime (background)",
    short_name="Regime",
    category="structure",
    overlay=True,
    inputs=("close",),
    params=(length_param(252, minimum=4 * max(variance_ratio.QS)),),
    outputs=(
        OutputSpec(
            "regime",
            "Regime",
            "background",
            "#787B86",
            style={"up": "#2962FF", "down": "#FF6D00"},
        ),
    ),
    warmup=lambda p: int(p["length"]),
    compute=compute,
    learn_slug="market-regime",
    description="Tints the chart: blue = trending, orange = mean-reverting (5 % test, 252 bars).",
    lookback=lambda p: max(MIN_LOOKBACK, int(p["length"]) + 2),
)
