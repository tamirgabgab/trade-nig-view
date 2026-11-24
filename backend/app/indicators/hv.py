r"""Historical Volatility from OHLC: five estimators of the per-bar variance over the last n bars.

With :math:`o_t = \ln(O_t/C_{t-1})` (the gap), :math:`c_t = \ln(C_t/O_t)` (the body),
:math:`r_t = \ln(C_t/C_{t-1}) = o_t + c_t` and :math:`\ell_t = \ln(H_t/L_t)`:

.. math::
    \text{close:}\quad \hat\sigma^2 = \tfrac1n \textstyle\sum (r - \bar r)^2
    \qquad (\text{population, as Pine } \texttt{ta.stdev})

    \text{Parkinson:}\quad \hat\sigma^2 = \tfrac1n \textstyle\sum \frac{\ell^2}{4\ln 2}

    \text{Garman-Klass:}\quad \hat\sigma^2 = \tfrac1n \textstyle\sum
        \big(\tfrac12 \ell^2 - (2\ln 2 - 1)\,c^2\big)

    \text{Rogers-Satchell:}\quad \hat\sigma^2 = \tfrac1n \textstyle\sum rs,\quad
        rs = \ln\tfrac{H}{C}\ln\tfrac{H}{O} + \ln\tfrac{L}{C}\ln\tfrac{L}{O}

    \text{Yang-Zhang:}\quad \hat\sigma^2 = s_o^2 + k\,s_c^2 + (1-k)\,\hat\sigma^2_{RS},\quad
        k = \frac{0.34}{1.34 + \frac{n+1}{n-1}}

where :math:`s_o^2, s_c^2` are the sample variances (:math:`n-1`) of the gaps and the bodies.
Parkinson, Garman-Klass and Rogers-Satchell see only the bar itself (no gap); Rogers-Satchell is
unbiased under a drift; Yang-Zhang adds the gaps and is the minimum-variance combination.

**Annualised:** :math:`100\,\hat\sigma\sqrt{N_t}` %, with :math:`N_t` the bars per year counted
from the bars' own times (``bars_per_year``: causal, so it suits every interval and market); else
:math:`100\,\hat\sigma` % per bar. Warm-up: :math:`n` bars (close, Yang-Zhang: the first gap needs
a previous close), :math:`n - 1` (the others).
"""

from __future__ import annotations

import math

import numpy as np

from app.indicators import core
from app.indicators.ma import length_param
from app.indicators.registry import (
    MIN_LOOKBACK,
    IndicatorSpec,
    OutputSpec,
    Params,
    ParamSpec,
)
from app.models.bars import BarFrame, FloatArray

ESTIMATORS: dict[str, str] = {
    "yang_zhang": "Yang-Zhang",
    "close": "Close to close",
    "parkinson": "Parkinson",
    "garman_klass": "Garman-Klass",
    "rogers_satchell": "Rogers-Satchell",
}
#: Estimators whose window needs the previous bar's close (the gap or the return).
NEEDS_PREVIOUS = frozenset({"close", "yang_zhang"})
YEAR_SECONDS = 365.25 * 86_400
#: A variance needs two bars.
MIN_WINDOW = 2
GK_BODY = 2 * math.log(2) - 1
#: History before the first shown bar: the windows are exact (no recursion), so the window plus a
#: calendar year of daily bars for the bars-per-year count.
YEAR_LOOKBACK = 300


def gaps(frame: BarFrame) -> FloatArray:
    """:math:`o_t = \\ln(O_t/C_{t-1})`, NaN on bar 0."""
    return np.log(frame.open / np.concatenate(([np.nan], frame.close[:-1])))


def returns(frame: BarFrame) -> FloatArray:
    """:math:`r_t = \\ln(C_t/C_{t-1})`, NaN on bar 0."""
    return np.log(frame.close / np.concatenate(([np.nan], frame.close[:-1])))


def bodies(frame: BarFrame) -> FloatArray:
    """:math:`c_t = \\ln(C_t/O_t)`."""
    return np.log(frame.close / frame.open)


def parkinson_terms(frame: BarFrame) -> FloatArray:
    return np.log(frame.high / frame.low) ** 2 / (4 * math.log(2))


def garman_klass_terms(frame: BarFrame) -> FloatArray:
    return 0.5 * np.log(frame.high / frame.low) ** 2 - GK_BODY * bodies(frame) ** 2


def rogers_satchell_terms(frame: BarFrame) -> FloatArray:
    h, low, o, c = frame.high, frame.low, frame.open, frame.close
    return np.log(h / c) * np.log(h / o) + np.log(low / c) * np.log(low / o)


def yz_weight(n: int) -> float:
    return 0.34 / (1.34 + (n + 1) / (n - 1))


def _sample_variance(x: FloatArray, n: int) -> FloatArray:
    return core.stdev(x, n) ** 2 * (n / (n - 1))


def rolling_variance(frame: BarFrame, estimator: str, n: int) -> FloatArray:
    """The per-bar variance of the last ``n`` bars by ``estimator`` (NaN during warm-up)."""
    if n < MIN_WINDOW:
        raise ValueError(f"n must be >= {MIN_WINDOW}, got {n}")
    match estimator:
        case "close":
            return core.stdev(returns(frame), n) ** 2
        case "parkinson":
            return core.sma(parkinson_terms(frame), n)
        case "garman_klass":
            return core.sma(garman_klass_terms(frame), n)
        case "rogers_satchell":
            return core.sma(rogers_satchell_terms(frame), n)
        case "yang_zhang":
            k = yz_weight(n)
            rs = core.sma(rogers_satchell_terms(frame), n)
            return (
                _sample_variance(gaps(frame), n)
                + k * _sample_variance(bodies(frame), n)
                + (1 - k) * rs
            )
        case _:
            raise ValueError(f"unknown estimator {estimator!r}")


def bars_per_year(time: FloatArray | np.ndarray) -> FloatArray:
    """:math:`N_t`: the bars in the calendar year up to bar t, :math:`(t_{open} - 1\\,y,
    t_{open}]`; before a year of history, the bar rate so far scaled to a year (NaN on bar 0).

    Only bars up to t are used, and a daily stock gets about 252, a weekly series 52, hourly
    stock bars about 1,764, crypto hours 8,766: the trading time, not the calendar.
    """
    t = np.asarray(time, dtype=np.float64)
    first = np.searchsorted(t, t - YEAR_SECONDS, side="right")
    index = np.arange(len(t), dtype=np.float64)
    elapsed = t - t[0] if len(t) else t
    with np.errstate(divide="ignore", invalid="ignore"):
        partial = np.where(elapsed > 0, index / (elapsed / YEAR_SECONDS), np.nan)
    full = index - first + 1
    return np.where(elapsed >= YEAR_SECONDS, full, partial)


def warmup(estimator: str, n: int) -> int:
    return n if estimator in NEEDS_PREVIOUS else n - 1


def hv(frame: BarFrame, estimator: str, n: int, annualize: bool) -> FloatArray:
    """Volatility in %: annualised with ``bars_per_year`` or per bar."""
    sigma = np.sqrt(np.maximum(rolling_variance(frame, estimator, n), 0.0))
    scale = np.sqrt(bars_per_year(frame.time)) if annualize else 1.0
    return 100 * sigma * scale


def estimator_param() -> ParamSpec:
    return ParamSpec(
        "estimator",
        "enum",
        "yang_zhang",
        "Estimator",
        options=tuple(ESTIMATORS),
        option_labels=tuple(ESTIMATORS.values()),
    )


def annualize_param() -> ParamSpec:
    return ParamSpec("annualize", "bool", True, "Annualised")


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    estimator, n = str(params["estimator"]), int(params["length"])
    return {"hv": hv(frame, estimator, n, bool(params["annualize"]))}


def lookback(params: Params) -> int:
    n = int(params["length"])
    return max(MIN_LOOKBACK, YEAR_LOOKBACK + n)


SPEC = IndicatorSpec(
    id="hv",
    version=1,
    name="Historical Volatility (OHLC)",
    short_name="HV",
    category="volatility",
    overlay=False,
    inputs=("open", "high", "low", "close"),
    params=(estimator_param(), length_param(21, minimum=MIN_WINDOW), annualize_param()),
    outputs=(OutputSpec("hv", "HV %", "line", "#7E57C2"),),
    warmup=lambda p: warmup(str(p["estimator"]), int(p["length"])),
    compute=compute,
    learn_slug="historical-volatility",
    description="Volatility from open, high, low and close (Yang-Zhang by default), in % a year.",
    lookback=lookback,
)
