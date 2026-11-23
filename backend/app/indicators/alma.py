r"""Arnaud Legoux Moving Average (Pine ``ta.alma``).

.. math:: \mathrm{ALMA}_t = \frac{\sum_{j=0}^{n-1} w_j\, x_{t-n+1+j}}{\sum_j w_j},
   \qquad w_j = e^{-\frac{(j-m)^2}{2s^2}},\ m = \text{offset}\,(n-1),\ s = \frac{n}{\sigma}

A Gaussian window placed towards the recent end of the window (offset 0.85); sigma sets its
width. Non-negative weights, lag 1.56 and NRF 0.233 at the defaults. ``floor`` rounds :math:`m`
down (Pine's ``floor`` argument). Warm-up :math:`n-1`.
TradingView default: window 9, offset 0.85, sigma 6, source close.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import length_param, ma_warmup, source_param
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    y = core.alma(
        x,
        int(params["length"]),
        float(params["alma_offset"]),
        float(params["sigma"]),
        bool(params["floor"]),
    )
    return {"ma": y}


SPEC = IndicatorSpec(
    id="alma",
    version=1,
    name="Arnaud Legoux Moving Average",
    short_name="ALMA",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close"),
    params=(
        length_param(9, label="Window size"),
        ParamSpec(
            "alma_offset",
            "float",
            core.ALMA_DEFAULT_OFFSET,
            "Offset",
            min=0.0,
            max=1.0,
            step=0.01,
        ),
        ParamSpec("sigma", "float", core.ALMA_DEFAULT_SIGMA, "Sigma", min=0.1, max=100.0, step=0.5),
        source_param(),
        ParamSpec("floor", "bool", False, "Floor offset"),
    ),
    outputs=(OutputSpec("ma", "ALMA", "line", "#29B6F6"),),
    warmup=lambda p: ma_warmup("alma", int(p["length"])),
    compute=compute,
    learn_slug="alma",
    description="Gaussian-weighted window shifted towards recent bars: smooth with little lag.",
)
