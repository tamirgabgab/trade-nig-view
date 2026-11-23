r"""Filter view: an indicator's response to synthetic inputs, measured by running the real code.

A linear, time-invariant MA is a causal filter :math:`y_t = \sum_k h_k x_{t-k}`. Feeding a unit
impulse after the warm-up gives :math:`h_k` directly, and everything else follows from it:

.. math::

   \text{DC gain} = \sum_k h_k, \qquad \bar k = \frac{\sum_k k\,h_k}{\sum_k h_k}, \qquad
   \mathrm{NRF} = \sum_k h_k^2, \qquad H(e^{j\omega}) = \sum_k h_k e^{-j\omega k}, \qquad
   \tau(\omega) = -\frac{d \arg H}{d\omega} = \operatorname{Re}
   \frac{\sum_k k\,h_k e^{-j\omega k}}{H(e^{j\omega})}

with :math:`\omega = 2\pi / P` for a cycle of :math:`P` bars. :math:`\bar k` is the lag behind a
straight line and the group delay at :math:`\omega = 0`; NRF is the variance of filtered white
noise (unit input variance).

Linearity is **measured**, not declared: an output is linear only if superposition holds on
random walks, :math:`f(x_1 + 2x_2) = f(x_1) + 2f(x_2)`, and the output does not change with the
volume series. Adaptive (KAMA, McGinley) and volume-weighted (VWMA) averages fail and get the
step and ramp responses only, with the reason.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.indicators.registry import IndicatorSpec, Params
from app.models.bars import BarFrame, FloatArray

#: Impulse taps computed at most (the IIR tail of a very long RMA or T3 is cut here).
MAX_TAPS = 50_000
#: Taps and step bars returned for plotting (the measures use every computed tap).
MAX_SHOWN = 500
#: Periods (bars per cycle) of the frequency response: log-spaced, 2 to 200 bars.
PERIODS = np.geomspace(2.0, 200.0, 121)
#: Floor of the magnitude in dB (the exact zeros of an SMA are -inf); the group delay is
#: undefined below it.
DB_FLOOR = -120.0
ZERO_GAIN = 10.0 ** (DB_FLOOR / 20.0)
#: Bars of random walk used to test linearity.
TEST_BARS = 300
#: Step and ramp inputs live at price-like levels (McGinley is not shift-invariant).
BASE = 100.0
STEP = 10.0
SLOPE = 0.1
LINEAR_RTOL = 1e-9
#: A tap counts as visible on the plot when it is above this fraction of the largest tap.
VISIBLE = 1e-4

ADAPTIVE = (
    "The smoothing depends on the input itself (superposition fails), so there is no single "
    "impulse or frequency response; the step and ramp responses show how it behaves."
)
VOLUME = (
    "The weights are the bars' volumes, so the filter changes from bar to bar; the step and ramp "
    "responses are for constant volume."
)


@dataclass(frozen=True, slots=True)
class FrequencyResponse:
    period: FloatArray
    magnitude_db: FloatArray
    group_delay: FloatArray


@dataclass(frozen=True, slots=True)
class OutputResponse:
    """The measured response of one output. Linear-only fields are ``None`` otherwise."""

    name: str
    label: str
    reason: str | None  # why it is not linear; None when it is
    step: FloatArray  # unit step response from the step bar on (settles at the DC gain)
    ramp_lag: float  # bars behind a straight line once settled
    impulse: FloatArray | None = None
    dc_gain: float | None = None
    lag: float | None = None
    nrf: float | None = None
    frequency: FrequencyResponse | None = None
    truncated: bool = False  # the impulse was cut at MAX_TAPS before its tail died out

    @property
    def linear(self) -> bool:
        return self.reason is None


def _frame(x: FloatArray, volume: FloatArray | None = None) -> BarFrame:
    """Bars with open = high = low = close = ``x`` (so every source is ``x``)."""
    n = len(x)
    return BarFrame.from_columns(
        time=np.arange(n, dtype=np.int64) * 86_400,
        open=x,
        high=x,
        low=x,
        close=x,
        volume=np.ones(n) if volume is None else volume,
    )


def _run(
    spec: IndicatorSpec, params: Params, x: FloatArray, volume: FloatArray | None = None
) -> dict[str, FloatArray]:
    outputs = spec.compute(_frame(x, volume), params)
    return {o.name: outputs[o.name] for o in spec.outputs if o.plot != "markers"}


def _close(a: FloatArray, b: FloatArray) -> bool:
    return bool(np.allclose(a, b, rtol=LINEAR_RTOL, atol=LINEAR_RTOL * BASE, equal_nan=True))


def _reasons(spec: IndicatorSpec, params: Params, start: int) -> dict[str, str | None]:
    """Per output: None if it is linear in the price and ignores volume, else why not."""
    rng = np.random.default_rng(7)
    n = start + TEST_BARS
    x1 = BASE + np.cumsum(rng.normal(0.0, 1.0, n))
    x2 = BASE + np.cumsum(rng.normal(0.0, 1.0, n))
    v1, v2 = rng.uniform(1.0, 2.0, n), rng.uniform(1.0, 2.0, n)
    f1 = _run(spec, params, x1, v1)
    f2 = _run(spec, params, x2, v1)
    f12 = _run(spec, params, x1 + 2.0 * x2, v1)
    other_volume = _run(spec, params, x1, v2)
    reasons: dict[str, str | None] = {}
    for name in f1:
        if not _close(f1[name], other_volume[name]):
            reasons[name] = VOLUME
        elif not _close(f12[name], f1[name] + 2.0 * f2[name]):
            reasons[name] = ADAPTIVE
        else:
            reasons[name] = None
    return reasons


def _shown(curve: FloatArray, final: float) -> FloatArray:
    """``curve`` up to where it has settled at ``final`` (at least 2, at most MAX_SHOWN bars)."""
    scale = max(float(np.nanmax(np.abs(curve))), abs(final), 1e-300)
    away = np.flatnonzero(~(np.abs(curve - final) <= VISIBLE * scale))
    end = int(away[-1]) + 2 if away.size else 2
    return curve[: min(max(end, 2), MAX_SHOWN, len(curve))]


def _frequency(h: FloatArray) -> FrequencyResponse:
    k = np.arange(len(h), dtype=np.float64)
    magnitude = np.empty(len(PERIODS))
    delay = np.empty(len(PERIODS))
    for i, period in enumerate(PERIODS):
        phasor = np.exp(-2j * np.pi * k / period)
        transfer = complex(h @ phasor)
        moment = complex((k * h) @ phasor)
        magnitude[i] = abs(transfer)
        delay[i] = (moment / transfer).real if abs(transfer) > ZERO_GAIN else np.nan
    with np.errstate(divide="ignore"):
        db = np.maximum(20.0 * np.log10(magnitude), DB_FLOOR)
    return FrequencyResponse(PERIODS.copy(), db, delay)


def filter_response(spec: IndicatorSpec, params: Params) -> list[OutputResponse]:
    """Measure every line output of ``spec`` with ``params`` (validated by the caller).

    The impulse and the step enter one bar after the warm-up, so every seed (an SMA, an EMA of an
    EMA, ...) has already been computed on the flat input before them.
    """
    start = spec.warmup(params) + 1
    # The lookback leaves a seed weight of e^-25; the lag is a first moment, so twice as many taps
    # (e^-50) keep it exact to 1e-9 too.
    wanted = 2 * spec.total_lookback(params)
    taps = min(max(wanted, 2 * MAX_SHOWN), MAX_TAPS)
    n = start + taps
    reasons = _reasons(spec, params, start)

    impulse_in = np.zeros(n)
    impulse_in[start] = 1.0
    step_in = np.full(n, BASE)
    step_in[start:] += STEP
    ramp_in = BASE + SLOPE * np.arange(n, dtype=np.float64)
    impulses = _run(spec, params, impulse_in)
    steps = _run(spec, params, step_in)
    ramps = _run(spec, params, ramp_in)

    labels = {o.name: o.label for o in spec.outputs}
    results: list[OutputResponse] = []
    for name, reason in reasons.items():
        if reason is not None:
            step = (steps[name][start:] - BASE) / STEP
            ramp_lag = float((ramp_in[-1] - ramps[name][-1]) / SLOPE)
            results.append(OutputResponse(name, labels[name], reason, _shown(step, 1.0), ramp_lag))
            continue
        h = impulses[name][start:]
        gain = float(h.sum())
        # On a ramp a + b t a linear filter gives gain (a + b (t - lag)).
        ramp_lag = float((ramp_in[-1] - ramps[name][-1] / gain) / SLOPE)
        results.append(
            OutputResponse(
                name,
                labels[name],
                None,
                _shown(np.cumsum(h), gain),
                ramp_lag,
                impulse=_shown(h, 0.0),
                dc_gain=gain,
                lag=float(np.arange(len(h)) @ h / gain),
                nrf=float(h @ h),
                frequency=_frequency(h),
                truncated=taps < wanted,
            )
        )
    return results
