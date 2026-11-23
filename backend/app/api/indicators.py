"""``GET /api/indicators`` (registry) and ``POST /api/indicators/compute``."""

from __future__ import annotations

from datetime import date
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

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


class OutputInfo(BaseModel):
    name: str
    label: str
    plot: PlotStyle
    color: str = Field(description="Default colour (#RRGGBB)")
    line_width: int
    style: dict[str, str] = Field(default_factory=dict[str, str])


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
    lookback: int = Field(description="Extra history bars loaded before `start`")


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
