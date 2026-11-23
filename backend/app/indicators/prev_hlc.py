r"""Previous Period High/Low/Close: the high, low and close of the previous day, week or month.

For bar :math:`t` in period :math:`P_k` (the k-th period of the data that has bars):

.. math::
   H^{prev}_t = \max_{i \in P_{k-1}} H_i, \qquad
   L^{prev}_t = \min_{i \in P_{k-1}} L_i, \qquad
   C^{prev}_t = C_{\text{last bar of } P_{k-1}}

Periods are UTC calendar days, ISO weeks (Monday 00:00 UTC to Sunday) or UTC calendar months of
each bar's open time (``frame.time``). The output is ``NaN`` on the first period of the data, which
has no earlier period. Once a bar of :math:`P_k` exists :math:`P_{k-1}` is complete, so the value
at bar :math:`t` uses only bars :math:`\le t`.

Shortcut: UTC periods, upgrade to exchange-session periods when 24h markets need it. A US equity
session (09:30-16:00 New York) always lies inside one UTC day, so the day periods match its
sessions; 24h markets (forex, futures) roll at 00:00 UTC instead of the exchange's session close.

Warm-up: data-dependent (the bars before the second period); declared 0, as for VWAP. The values
depend on where the first period starts, so the compute endpoint loads the whole history (as OBV).
"""

from __future__ import annotations

import numpy as np

from app.indicators import core
from app.indicators.obv import WHOLE_HISTORY
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, IntArray

PERIODS = ("day", "week", "month")
#: 1970-01-01 was a Thursday: day number + 3 counts from the Monday before it.
_MONDAY_OFFSET = 3


def period_keys(time: IntArray, period: str) -> IntArray:
    """Non-decreasing period number of each bar: UTC day, ISO week (from Monday) or month."""
    days = time // SECONDS_PER_DAY
    if period == "day":
        return days
    if period == "week":
        return (days + _MONDAY_OFFSET) // 7
    return days.astype("datetime64[D]").astype("datetime64[M]").astype(np.int64)


def prev_hlc(
    high: FloatArray, low: FloatArray, close: FloatArray, keys: IntArray
) -> tuple[FloatArray, FloatArray, FloatArray]:
    """High, low and close of the previous period, per bar (``NaN`` in the first period)."""
    outs = (core.nan_like(high), core.nan_like(low), core.nan_like(close))
    n = len(keys)
    if n == 0:
        return outs
    first = np.concatenate(([True], keys[1:] != keys[:-1]))  # first bar of each period
    starts = np.flatnonzero(first)
    ends = np.append(starts[1:], n)
    period = np.cumsum(first) - 1  # period index of each bar
    later = period > 0
    previous = period[later] - 1
    per_period = (
        np.maximum.reduceat(high, starts),
        np.minimum.reduceat(low, starts),
        close[ends - 1],
    )
    for out, values in zip(outs, per_period, strict=True):
        out[later] = values[previous]
    return outs


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    keys = period_keys(frame.time, str(params["period"]))
    high, low, close = prev_hlc(frame.high, frame.low, frame.close, keys)
    return {"high": high, "low": low, "close": close}


def _output(name: str, label: str, color: str) -> OutputSpec:
    return OutputSpec(name, label, "line", color, line_width=1, style={"line_type": "step"})


SPEC = IndicatorSpec(
    id="prev_hlc",
    version=1,
    name="Previous Period High/Low/Close",
    short_name="Prev HLC",
    category="structure",
    overlay=True,
    inputs=("high", "low", "close"),
    params=(
        ParamSpec(
            "period",
            "enum",
            "day",
            "Period",
            options=PERIODS,
            option_labels=("Day", "Week", "Month"),
        ),
    ),
    outputs=(
        _output("high", "Prev high", "#089981"),
        _output("low", "Prev low", "#F23645"),
        _output("close", "Prev close", "#787B86"),
    ),
    warmup=lambda _p: 0,
    compute=compute,
    learn_slug="previous-hlc",
    description="High, low and close of the previous day, week or month (UTC periods).",
    lookback=lambda _p: WHOLE_HISTORY,
)
