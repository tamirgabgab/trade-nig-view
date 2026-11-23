r"""Volume Weighted Average Price, anchored to each trading session.

.. math:: \mathrm{VWAP}_t = \frac{\sum_{i \in s(t),\, i \le t} p_i V_i}
   {\sum_{i \in s(t),\, i \le t} V_i}

where :math:`s(t)` is the session of bar :math:`t` and :math:`p` the source (default hlc3). It
resets on the first bar of every session (``BarFrame.session``, set for intraday bars). Daily and
longer bars have no sessions: the output is all ``NaN`` there (hidden on daily+, as in Phase 1 of
the research). ``NaN`` while the session's volume so far is 0. Warm-up 0.
"""

from __future__ import annotations

import numpy as np

from app.indicators import core
from app.indicators.ma import source_param
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray, IntArray


def vwap(price: FloatArray, volume: FloatArray, session: IntArray) -> FloatArray:
    """Session-anchored VWAP; each session's running sums restart from zero (exactly, not by
    subtracting a global cumulative sum)."""
    out = core.nan_like(price)
    n = len(price)
    if n == 0:
        return out
    starts = np.flatnonzero(np.concatenate(([True], session[1:] != session[:-1])))
    weighted = price * volume
    for lo, hi in zip(starts.tolist(), [*starts[1:].tolist(), n], strict=True):
        total = np.cumsum(volume[lo:hi])
        ok = total > 0
        out[lo:hi][ok] = np.cumsum(weighted[lo:hi])[ok] / total[ok]
    return out


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    if frame.session is None:
        return {"vwap": core.nan_like(frame.close)}
    x = core.source(frame, str(params["source"]))
    return {"vwap": vwap(x, frame.volume, frame.session)}


SPEC = IndicatorSpec(
    id="vwap",
    version=1,
    name="VWAP",
    short_name="VWAP",
    category="volume",
    overlay=True,
    inputs=("high", "low", "close", "volume"),
    params=(source_param("hlc3"),),
    outputs=(OutputSpec("vwap", "VWAP", "line", "#2962FF"),),
    warmup=lambda _p: 0,
    compute=compute,
    learn_slug="vwap",
    description="Average price weighted by volume since the session open (intraday only).",
)
