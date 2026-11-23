r"""Pivot Points High/Low (fractals): a bar higher (lower) than L bars before and R bars after it.

Bar :math:`p` is a pivot high if :math:`H_p > H_j` for every
:math:`j \in [p-L, p) \cup (p, p+R]`, a pivot low if :math:`L_p < L_j` for those :math:`j`
(strict on both sides, docs/TRADINGVIEW_RESEARCH.md section 6). Bars with fewer than :math:`L`
bars on their left are never pivots.

A pivot is **confirmed** at bar :math:`t = p + R`, when its right side is complete, so the value is
stored there:

.. math:: \text{high}_t = \begin{cases} H_{t-R} & t - R \text{ is a pivot high} \\
   \text{NaN} & \text{otherwise} \end{cases}

(``low`` alike). The value at bar :math:`t` uses only bars :math:`\le t`; in replay a pivot appears
R bars late. ``display_shift = R`` tells the chart to draw each marker R bars to the left, on the
pivot bar itself. First possible value: bar :math:`L + R`.
"""

from __future__ import annotations

import numpy as np

from app.indicators import core
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import BarFrame, FloatArray


def confirmed_pivots(x: FloatArray, left: int, right: int, sign: float) -> FloatArray:
    """Pivot values of ``x`` stored at their confirmation bar; ``sign`` +1 = highs, -1 = lows.

    With :math:`y = \\text{sign} \\cdot x`, bar :math:`p = t - R` is a pivot if
    :math:`y_p > \\max(y_{p-L..p-1})` (``highest_L(y)`` at :math:`p-1`) and
    :math:`y_p > \\max(y_{p+1..p+R})` (``highest_R(y)`` at :math:`t`).
    """
    y = sign * core.as_float(x)
    n = len(y)
    out = core.nan_like(y)
    if n <= left + right:
        return out
    left_max = core.highest(y, left)  # at p - 1: max of the L bars before p
    right_max = core.highest(y, right)  # at t = p + R: max of the R bars after p
    t = np.arange(left + right, n)
    p = t - right
    candidate = y[p]
    pivot = (candidate > left_max[p - 1]) & (candidate > right_max[t])
    out[t[pivot]] = x[p[pivot]]
    return out


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    left, right = int(params["left"]), int(params["right"])
    return {
        "high": confirmed_pivots(frame.high, left, right, 1.0),
        "low": confirmed_pivots(frame.low, left, right, -1.0),
    }


def _bars_param(name: str, label: str) -> ParamSpec:
    return ParamSpec(name, "int", 5, label, min=1, max=50, step=1)


SPEC = IndicatorSpec(
    id="pivots",
    version=1,
    name="Pivot Points High/Low",
    short_name="Pivots",
    category="structure",
    overlay=True,
    inputs=("high", "low"),
    params=(_bars_param("left", "Left bars"), _bars_param("right", "Right bars")),
    outputs=(
        OutputSpec(
            "high",
            "Pivot high",
            "markers",
            "#F23645",
            style={"shape": "circle", "position": "above"},
        ),
        OutputSpec(
            "low",
            "Pivot low",
            "markers",
            "#089981",
            style={"shape": "circle", "position": "below"},
        ),
    ),
    warmup=lambda p: int(p["left"]) + int(p["right"]),
    compute=compute,
    learn_slug="pivots",
    description="Swing highs and lows: bars beyond the L bars before and R bars after them.",
    display_shift=lambda p: int(p["right"]),
)
