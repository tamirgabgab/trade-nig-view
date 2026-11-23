r"""On Balance Volume (Granville): volume added on up closes and subtracted on down closes.

.. math:: OBV_0 = 0, \qquad OBV_t = OBV_{t-1} + \operatorname{sign}(C_t - C_{t-1})\,V_t

Pine ``ta.obv`` starts from 0 on the first bar. The level depends on where the history starts;
only its shape (slope, divergences) means something. Warm-up 0.
"""

from __future__ import annotations

import numpy as np

from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray

#: OBV is a running sum from the first bar: any later start changes every value by a constant. A
#: lookback larger than any history makes the compute endpoint always load the whole history, so
#: values do not move when the chart loads older bars.
WHOLE_HISTORY = 10**9


def obv(close: FloatArray, volume: FloatArray) -> FloatArray:
    """The OBV running sum (``np.cumsum`` adds sequentially, like the scalar definition)."""
    step = np.zeros(len(close), dtype=np.float64)
    if len(close) > 1:
        step[1:] = np.sign(np.diff(close)) * volume[1:]
    return np.cumsum(step)


def compute(frame: BarFrame, _params: Params) -> dict[str, FloatArray]:
    return {"obv": obv(frame.close, frame.volume)}


SPEC = IndicatorSpec(
    id="obv",
    version=1,
    name="On Balance Volume",
    short_name="OBV",
    category="volume",
    overlay=False,
    inputs=("close", "volume"),
    params=(),
    outputs=(OutputSpec("obv", "OBV", "line", "#2962FF", style={"format": "volume"}),),
    warmup=lambda _p: 0,
    compute=compute,
    learn_slug="obv",
    description="Running total of volume, signed by the close-to-close direction.",
    lookback=lambda _p: WHOLE_HISTORY,
)
