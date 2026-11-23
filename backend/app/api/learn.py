"""Learn platform: ``GET /api/learn`` (page index), ``GET /api/learn/{slug}`` (a page, Markdown
with LaTeX math) and ``POST /api/learn/lab`` (indicators + conditions + event study on synthetic
or real bars)."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable
from http import HTTPStatus
from pathlib import Path
from typing import Annotated, Literal, get_args

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.analysis.conditions import Condition, evaluate
from app.analysis.events import Stats, event_study
from app.analysis.synthetic import Scenario, synthetic_bars
from app.api.deps import get_bar_service
from app.api.indicators import ParamValue
from app.config import Settings, get_settings
from app.data.bar_service import BarService
from app.errors import ChartLabError
from app.indicators.catalog import CATALOG, get_spec
from app.indicators.registry import Category, IndicatorSpec, resolve_params
from app.models.bars import BarFrame, FloatArray, Interval, ts_to_iso_dates

router = APIRouter(tags=["learn"])

#: Concept pages (``docs/indicators/<slug>.md``) that are not about one indicator: slug -> title.
CONCEPT_PAGES: dict[str, str] = {"combinations": "Combining indicators"}
#: Slugs shared by several indicators, served under this indicator's metadata.
_SLUG_OWNER = {"moving-average": "ma"}
_HEADING_ID = re.compile(r"\s*\(`[^`]*`\)\s*$")
_CATEGORY_ORDER: dict[str | None, int] = {c: i for i, c in enumerate(get_args(Category))}


class LearnPageNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "learn_page_not_found"


class InvalidLabRequestError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_lab_request"


class LearnPage(BaseModel):
    slug: str
    markdown: str


class LearnIndexEntry(BaseModel):
    slug: str
    title: str
    kind: Literal["indicator", "concept"]
    category: Category | None = Field(description="Indicator category; null for concept pages")
    indicator_id: str | None = Field(description="Indicator the page is about; null for concepts")


class LearnIndex(BaseModel):
    pages: list[LearnIndexEntry] = Field(
        description="Indicator pages by category then title, then concept pages"
    )


def _indicator_pages() -> dict[str, IndicatorSpec]:
    """learn_slug -> the spec whose metadata the page is listed under."""
    pages: dict[str, IndicatorSpec] = {}
    for spec in CATALOG.values():
        pages.setdefault(spec.learn_slug, spec)
    pages.update({slug: CATALOG[spec_id] for slug, spec_id in _SLUG_OWNER.items()})
    return pages


def _page_title(path: Path, fallback: str) -> str:
    """The page's first ``# `` heading without its trailing ``(`id`)``, else ``fallback``."""
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                return _HEADING_ID.sub("", line[2:]).strip() or fallback
    return fallback


@router.get("/learn", response_model=LearnIndex)
def learn_index(settings: Annotated[Settings, Depends(get_settings)]) -> LearnIndex:
    """Every learn page: one per indicator learn slug, plus the concept pages that exist."""
    indicators = sorted(
        (
            LearnIndexEntry(
                slug=slug,
                title=_page_title(settings.learn_dir / f"{slug}.md", spec.name),
                kind="indicator",
                category=spec.category,
                indicator_id=spec.id,
            )
            for slug, spec in _indicator_pages().items()
        ),
        key=lambda e: (_CATEGORY_ORDER[e.category], e.title.lower()),
    )
    concepts = sorted(
        (
            LearnIndexEntry(
                slug=slug, title=title, kind="concept", category=None, indicator_id=None
            )
            for slug, title in CONCEPT_PAGES.items()
            if (settings.learn_dir / f"{slug}.md").is_file()
        ),
        key=lambda e: e.title.lower(),
    )
    return LearnIndex(pages=indicators + concepts)


@router.get("/learn/{slug}", response_model=LearnPage)
def learn_page(slug: str, settings: Annotated[Settings, Depends(get_settings)]) -> LearnPage:
    """The page of a registered indicator's ``learn_slug`` or of a concept (only those: no path
    is built from arbitrary input)."""
    if slug not in {spec.learn_slug for spec in CATALOG.values()} | CONCEPT_PAGES.keys():
        raise LearnPageNotFoundError(f"No learn page '{slug}'")
    path = settings.learn_dir / f"{slug}.md"
    if not path.is_file():
        raise LearnPageNotFoundError(f"Learn page '{slug}' is missing")
    return LearnPage(slug=slug, markdown=path.read_text(encoding="utf-8"))


# --- lab ------------------------------------------------------------------------------------------

LabBars = Annotated[int, Field(ge=100, le=2000, description="Number of bars")]


class SyntheticSource(BaseModel):
    kind: Literal["synthetic"]
    scenario: Scenario = Scenario.RANDOM_WALK
    seed: Annotated[int, Field(ge=0, le=1_000_000)] = 1
    bars: LabBars = 500


class SymbolSource(BaseModel):
    kind: Literal["symbol"]
    symbol: Annotated[str, Field(min_length=1, max_length=20)]
    interval: Interval = Interval.D1
    bars: LabBars = Field(default=500, description="The last `bars` bars of the history")
    adjusted: bool = True


class LabIndicator(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=40, description="Indicator id")]
    params: dict[str, ParamValue] = Field(
        default_factory=dict[str, ParamValue], description="Missing parameters use defaults"
    )


class LabRequest(BaseModel):
    source: Annotated[SyntheticSource | SymbolSource, Field(discriminator="kind")]
    indicators: list[LabIndicator] = Field(default_factory=list[LabIndicator], max_length=4)
    conditions: list[Condition] = Field(
        default_factory=list[Condition],
        max_length=3,
        description="ANDed; an empty list means no event study",
    )
    horizon: Annotated[int, Field(ge=1, le=60, description="Forward return horizon in bars")] = 10


class LabIndicatorResult(BaseModel):
    id: str
    params: dict[str, ParamValue] = Field(description="Parameters used (defaults filled in)")
    outputs: dict[str, list[float | None]] = Field(
        description="One value per bar in `time`; null during warm-up"
    )
    display_shift: int = Field(description="As in /api/indicators/compute")


class StatsBlock(BaseModel):
    n: int
    mean: float | None
    median: float | None
    std: float | None = Field(description="Sample standard deviation (ddof=1); null if n < 2")
    hit_rate: float | None = Field(description="Share of returns > 0")


class Histogram(BaseModel):
    edges: list[float] = Field(description="22 shared bin edges (1st-99th baseline percentile)")
    events: list[float] = Field(description="Fraction of event returns per bin")
    baseline: list[float] = Field(description="Fraction of baseline returns per bin")


class LabStudy(BaseModel):
    horizon: int
    events: StatsBlock = Field(description="Forward log returns after the counted signal bars")
    baseline: StatsBlock = Field(description="Forward log returns after every bar")
    edge: float | None = Field(description="Mean of events minus mean of baseline")
    se: float | None = Field(description="Standard error of the event mean")
    t_stat: float | None
    ci95: list[float | None] = Field(description="[low, high] of edge +- 1.96 se")
    histogram: Histogram
    event_index: list[int] = Field(description="Bar indices (into `time`) of the counted events")


class LabResponse(BaseModel):
    time: list[str | int] = Field(
        description="Bar times, as in /api/bars ('YYYY-MM-DD' or UTC epoch seconds)"
    )
    open: list[float]
    high: list[float]
    low: list[float]
    close: list[float]
    volume: list[float]
    indicators: list[LabIndicatorResult]
    study: LabStudy | None = Field(description="Null when there are no conditions")


def _num(x: float) -> float | None:
    return x if math.isfinite(x) else None


def _values(y: FloatArray) -> list[float | None]:
    return [float(v) if np.isfinite(v) else None for v in y.tolist()]


def _stats_block(s: Stats) -> StatsBlock:
    return StatsBlock(
        n=s.n, mean=_num(s.mean), median=_num(s.median), std=_num(s.std), hit_rate=_num(s.hit_rate)
    )


def _check_operands(conditions: Iterable[Condition], specs: list[IndicatorSpec]) -> None:
    for i, c in enumerate(conditions):
        for side, op in (("left", c.left), ("right", c.right)):
            if op.indicator is None:
                continue
            where = f"conditions[{i}].{side}"
            if op.indicator >= len(specs):
                raise InvalidLabRequestError(
                    f"{where}: indicator {op.indicator} is out of range ({len(specs)} given)"
                )
            spec = specs[op.indicator]
            names = [o.name for o in spec.outputs]
            if op.output not in names:
                raise InvalidLabRequestError(
                    f"{where}: {spec.id} has no output '{op.output}' (outputs: {', '.join(names)})"
                )


def _lab_frame(source: SyntheticSource | SymbolSource, service: BarService) -> BarFrame:
    if isinstance(source, SyntheticSource):
        return synthetic_bars(source.scenario, source.seed, source.bars)
    result = service.get_bars(
        source.symbol, source.interval, adjusted=source.adjusted, limit=source.bars
    )
    return result.frame


@router.post("/learn/lab", response_model=LabResponse)
def learn_lab(
    request: LabRequest, service: Annotated[BarService, Depends(get_bar_service)]
) -> LabResponse:
    """Bars (synthetic scenario or a symbol's last bars), indicators computed over all of them,
    and, when there are conditions, an event study of the forward returns after the signal
    (``app.analysis.events``: an illustration, not a backtest)."""
    specs = [get_spec(ind.id) for ind in request.indicators]
    params = [
        resolve_params(spec, ind.params)
        for spec, ind in zip(specs, request.indicators, strict=True)
    ]
    _check_operands(request.conditions, specs)
    frame = _lab_frame(request.source, service)
    outputs = [spec.run(frame, p) for spec, p in zip(specs, params, strict=True)]
    intraday = isinstance(request.source, SymbolSource) and request.source.interval.is_intraday
    times: list[str] | list[int] = (
        [int(t) for t in frame.time] if intraday else ts_to_iso_dates(frame.time)
    )
    study = None
    if request.conditions:
        es = event_study(frame.close, evaluate(request.conditions, frame, outputs), request.horizon)
        study = LabStudy(
            horizon=es.horizon,
            events=_stats_block(es.events),
            baseline=_stats_block(es.baseline),
            edge=_num(es.edge),
            se=_num(es.se),
            t_stat=_num(es.t_stat),
            ci95=[_num(es.ci95[0]), _num(es.ci95[1])],
            histogram=Histogram(
                edges=es.edges.tolist(),
                events=es.events_hist.tolist(),
                baseline=es.baseline_hist.tolist(),
            ),
            event_index=es.event_index.tolist(),
        )
    return LabResponse(
        time=list(times),
        open=frame.open.tolist(),
        high=frame.high.tolist(),
        low=frame.low.tolist(),
        close=frame.close.tolist(),
        volume=frame.volume.tolist(),
        indicators=[
            LabIndicatorResult(
                id=spec.id,
                params=p,
                outputs={name: _values(y) for name, y in out.items()},
                display_shift=spec.display_shift(p),
            )
            for spec, p, out in zip(specs, params, outputs, strict=True)
        ],
        study=study,
    )
