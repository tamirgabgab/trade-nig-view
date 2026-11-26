"""``/api/macro`` - macro series (USD/ILS, CPI, dwelling prices, rates) from the Bank of Israel."""

from __future__ import annotations

from datetime import date
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_macro_service
from app.macro.series import SERIES
from app.macro.service import MacroService
from app.models.bars import date_to_ts, ts_to_iso_dates

router = APIRouter(tags=["macro"])


class MacroSeriesInfo(BaseModel):
    id: str
    name: str
    unit: str
    frequency: str = Field(description="'daily' or 'monthly' (a monthly value is dated the 1st)")
    source_series: str = Field(description="The Bank of Israel dataflow/code")


class MacroPoint(BaseModel):
    date: str
    value: float


class MacroSeriesResponse(MacroSeriesInfo):
    source: str = Field(description="Where the cached copy came from: 'boi' or 'fixtures'")
    stale: bool = Field(description="True if a refresh failed and the cached copy is served")
    warnings: list[str]
    points: list[MacroPoint]


@router.get("/macro/series", response_model=list[MacroSeriesInfo])
def list_series() -> list[MacroSeriesInfo]:
    """Every macro series ChartLab can serve."""
    return [
        MacroSeriesInfo(
            id=s.id,
            name=s.name,
            unit=s.unit,
            frequency=s.frequency,
            source_series=f"{s.dataflow}/{s.code}",
        )
        for s in SERIES.values()
    ]


@router.get("/macro/series/{series_id}", response_model=MacroSeriesResponse)
def get_series(
    series_id: str,
    service: Annotated[MacroService, Depends(get_macro_service)],
    start: date | None = None,
    end: date | None = None,
) -> MacroSeriesResponse:
    """The series' values with ``start <= date <= end`` (inclusive; all by default)."""
    cached = service.get(series_id)
    days, values = cached.data.days, cached.data.values
    keep = np.ones(len(days), dtype=bool)
    if start is not None:
        keep &= days >= date_to_ts(start) // 86_400
    if end is not None:
        keep &= days <= date_to_ts(end) // 86_400
    spec = cached.spec
    return MacroSeriesResponse(
        id=spec.id,
        name=spec.name,
        unit=spec.unit,
        frequency=spec.frequency,
        source_series=f"{spec.dataflow}/{spec.code}",
        source=cached.source,
        stale=cached.stale,
        warnings=list(cached.warnings),
        points=[
            MacroPoint(date=d, value=float(v))
            for d, v in zip(ts_to_iso_dates(days[keep] * 86_400), values[keep], strict=True)
        ],
    )
