"""``GET /api/indicators`` (registry) and ``POST /api/indicators/compute``."""

from __future__ import annotations

from datetime import date
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.analysis.response import OutputResponse, filter_response
from app.analysis.transforms import Transform
from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.indicators.catalog import CATALOG, get_spec
from app.indicators.registry import (
    Category,
    IndicatorSpec,
    Input,
    ParamType,
    PlotStyle,
    resolve_params,
)
from app.models.bars import FloatArray, Interval, ts_to_iso_dates

router = APIRouter(tags=["indicators"])

ParamValue = bool | int | float | str


class ParamInfo(BaseModel):
    name: str
    type: ParamType
    default: ParamValue
    label: str
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[str] = Field(default_factory=list[str])
    option_labels: list[str] = Field(
        default_factory=list[str],
        description="Display names of `options` (same order); empty = the ids",
    )
    requires: str | None = Field(
        default=None,
        description='Bool/enum param that switches this one on (true or not "none")',
    )


class OutputInfo(BaseModel):
    name: str
    label: str
    plot: PlotStyle
    color: str = Field(description="Default colour (#RRGGBB)")
    line_width: int
    style: dict[str, str] = Field(default_factory=dict[str, str])
    requires: str | None = Field(
        default=None,
        description='Bool/enum param that switches this line on (true or not "none")',
    )


class IndicatorInfo(BaseModel):
    id: str = Field(description="Stable id, used in layouts and tests")
    version: int = Field(description="Bumped when the output semantics change")
    name: str
    short_name: str
    category: Category
    overlay: bool = Field(description="True: drawn on the price pane; false: own pane")
    inputs: list[Input]
    params: list[ParamInfo]
    outputs: list[OutputInfo]
    levels: list[float]
    learn_slug: str = Field(description="docs/indicators/<learn_slug>.md")
    description: str


def _info(spec: IndicatorSpec) -> IndicatorInfo:
    return IndicatorInfo(
        id=spec.id,
        version=spec.version,
        name=spec.name,
        short_name=spec.short_name,
        category=spec.category,
        overlay=spec.overlay,
        inputs=list(spec.inputs),
        params=[
            ParamInfo(
                name=p.name,
                type=p.type,
                default=p.default,
                label=p.label,
                min=p.min,
                max=p.max,
                step=p.step,
                options=list(p.options),
                option_labels=list(p.option_labels),
                requires=p.requires,
            )
            for p in spec.params
        ],
        outputs=[
            OutputInfo(
                name=o.name,
                label=o.label,
                plot=o.plot,
                color=o.color,
                line_width=o.line_width,
                style=dict(o.style),
                requires=o.requires,
            )
            for o in spec.outputs
        ],
        levels=list(spec.levels),
        learn_slug=spec.learn_slug,
        description=spec.description,
    )


@router.get("/indicators", response_model=list[IndicatorInfo])
def list_indicators() -> list[IndicatorInfo]:
    """Every registered indicator with its inputs and outputs (the UI is generated from this)."""
    return [_info(spec) for spec in CATALOG.values()]


class ComputeRequest(BaseModel):
    symbol: Annotated[str, Field(min_length=1, max_length=20)]
    interval: Interval = Interval.D1
    id: Annotated[str, Field(min_length=1, max_length=40, description="Indicator id")]
    params: dict[str, ParamValue] = Field(
        default_factory=dict[str, ParamValue], description="Missing parameters use defaults"
    )
    start: Annotated[
        int | None,
        Field(ge=0, description="First bar to return: UTC epoch seconds of its start, inclusive"),
    ] = None
    end: Annotated[
        int | None,
        Field(ge=0, description="Last bar to return: UTC epoch seconds of its start, inclusive"),
    ] = None
    until: date | None = Field(default=None, description="Replay cursor: no bar after it")
    adjusted: bool = True
    transform: Transform = Transform.NONE


class ComputeResponse(BaseModel):
    id: str
    version: int
    params: dict[str, ParamValue] = Field(description="Parameters used (defaults filled in)")
    time: list[str | int] = Field(
        description="Bar times, as in /api/bars ('YYYY-MM-DD' or UTC epoch seconds)"
    )
    outputs: dict[str, list[float | None]] = Field(
        description="One value per bar in `time`; null during warm-up"
    )
    warmup: int = Field(
        description=(
            "Bars without a value at the start of the full history, for the output that starts "
            "last (a composite's faster outputs can start earlier)"
        )
    )
    lookback: int = Field(
        description=(
            "Extra history bars the indicator asks for before `start` (fewer are loaded when the"
            " history is shorter; 1000000000 = the whole history, e.g. OBV)"
        )
    )


def _values(y: FloatArray) -> list[float | None]:
    return [float(v) if np.isfinite(v) else None for v in y.tolist()]


@router.post("/indicators/compute", response_model=ComputeResponse)
def compute_indicator(
    request: ComputeRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
) -> ComputeResponse:
    """Indicator values for the bars in ``[start, end]``.

    ``lookback`` extra bars before ``start`` (per spec, at least ``max(25 n, 250)``, plus the plot
    offset) are loaded so the first returned values are warmed up exactly as in a full-history
    computation (ARCHITECTURE section 3.2).
    """
    spec = get_spec(request.id)
    params = resolve_params(spec, request.params)
    result = service.get_bars(
        request.symbol,
        request.interval,
        adjusted=request.adjusted,
        until=request.until,
        limit=1_000_000_000,
        before=None if request.end is None else request.end + 1,
        transform=request.transform,
    )
    frame = result.frame
    first = 0 if request.start is None else int(np.searchsorted(frame.time, request.start))
    lookback = spec.total_lookback(params)
    lo = max(first - lookback, 0)
    outputs = spec.run(frame.take(slice(lo, None)), params)
    shown = frame.take(slice(first, None))
    times: list[str] | list[int] = (
        [int(t) for t in shown.time]
        if request.interval.is_intraday
        else ts_to_iso_dates(shown.time)
    )
    return ComputeResponse(
        id=spec.id,
        version=spec.version,
        params=params,
        time=list(times),
        outputs={name: _values(y[first - lo :]) for name, y in outputs.items()},
        warmup=spec.warmup(params),
        lookback=lookback,
    )


class ResponseRequest(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=40, description="Indicator id")]
    params: dict[str, ParamValue] = Field(
        default_factory=dict[str, ParamValue], description="Missing parameters use defaults"
    )


class FrequencyInfo(BaseModel):
    period: list[float] = Field(description="Cycle length in bars (log-spaced, 2 to 200)")
    magnitude_db: list[float] = Field(description="20 log10 |H|, floored at -120 dB")
    group_delay: list[float | None] = Field(description="Bars; null where |H| = 0")


class OutputResponseInfo(BaseModel):
    name: str
    label: str
    linear: bool
    reason: str | None = Field(description="Why there is no impulse/frequency response")
    step: list[float] = Field(description="Unit step response from the step bar on")
    ramp_lag: float = Field(description="Bars behind a straight line once settled")
    impulse: list[float] | None = Field(description="h_k from k = 0 (until it dies out)")
    dc_gain: float | None
    lag: float | None = Field(description="Centre of mass of h_k (bars)")
    nrf: float | None = Field(description="Noise reduction factor, sum of h_k^2")
    frequency: FrequencyInfo | None
    truncated: bool = Field(description="The impulse tail was cut before it died out")


class ResponseInfo(BaseModel):
    id: str
    version: int
    params: dict[str, ParamValue] = Field(description="Parameters used (defaults filled in)")
    outputs: list[OutputResponseInfo]


def _response_info(r: OutputResponse) -> OutputResponseInfo:
    f = r.frequency
    return OutputResponseInfo(
        name=r.name,
        label=r.label,
        linear=r.linear,
        reason=r.reason,
        step=r.step.tolist(),
        ramp_lag=r.ramp_lag,
        impulse=None if r.impulse is None else r.impulse.tolist(),
        dc_gain=r.dc_gain,
        lag=r.lag,
        nrf=r.nrf,
        frequency=None
        if f is None
        else FrequencyInfo(
            period=f.period.tolist(),
            magnitude_db=f.magnitude_db.tolist(),
            group_delay=_values(f.group_delay),
        ),
        truncated=r.truncated,
    )


@router.post("/indicators/response", response_model=ResponseInfo)
def indicator_response(request: ResponseRequest) -> ResponseInfo:
    """The filter view of an indicator: its measured impulse, step, ramp and frequency response
    for these parameters, from the real implementation on synthetic bars (no market data)."""
    spec = get_spec(request.id)
    params = resolve_params(spec, request.params)
    return ResponseInfo(
        id=spec.id,
        version=spec.version,
        params=params,
        outputs=[_response_info(r) for r in filter_response(spec, params)],
    )
