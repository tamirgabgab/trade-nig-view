"""``/api/strategies`` - trader profiles, saved strategies, Python strategy files and signals (B0).

The engine that turns signals into trades is B1; here a strategy only says, per bar, where it
would enter and leave (long and short), shown as markers on the chart.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from http import HTTPStatus
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field, TypeAdapter

from app.api.deps import get_bar_service, get_python_strategies, get_strategies
from app.backtest.examples import EXAMPLES
from app.backtest.profiles import PROFILES, TraderProfile
from app.backtest.python_loader import PythonStrategies, python_signals
from app.backtest.signals import IndicatorSource, Signals, rule_signals
from app.backtest.strategy import PythonStrategy, RulesStrategy, Strategy
from app.data.bar_service import BarService, BarsResult
from app.errors import ChartLabError
from app.indicators.registry import ParamValue
from app.models.bars import BarFrame, IntArray, Interval, ts_to_iso_dates
from app.models.layouts import DocumentName
from app.storage.documents import SCHEMA_VERSION, Document, DocumentStore

router = APIRouter(tags=["strategies"])

#: Bars loaded per interval: the whole history (80 years of days; Yahoo keeps ~2 years of hours), so
#: a bar's signal does not depend on where a window would start (warm-up).
HISTORY_LIMIT = 20_000
_STRATEGY: TypeAdapter[RulesStrategy | PythonStrategy] = TypeAdapter(Strategy)
_CONFLICT: dict[int | str, dict[str, Any]] = {
    409: {"description": "Saved meanwhile elsewhere: reload (problem+json)"}
}
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "No strategy with this name (problem+json)"}
}


class StrategyNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "strategy_not_found"


class InvalidStrategyError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_strategy"


class StrategySummary(BaseModel):
    name: str
    revision: int
    updated_at: str
    kind: str
    profile: str


class StrategyDocument(BaseModel):
    name: str
    revision: int
    updated_at: str
    strategy: Strategy


class StrategyUpdate(BaseModel):
    revision: int = Field(ge=0, description="Revision the client last read; 0 = create")
    strategy: Strategy


class StrategyExample(BaseModel):
    name: str
    strategy: Strategy


class PythonParam(BaseModel):
    name: str
    type: str
    default: ParamValue
    label: str
    min: float | None
    max: float | None


class PythonFile(BaseModel):
    module: str = Field(description="File stem in strategies/")
    description: str
    params: list[PythonParam]
    error: str | None = Field(description="Why the file cannot be used (import or SPEC error)")


class StrategyCatalog(BaseModel):
    saved: list[StrategySummary] = Field(description="Newest first")
    examples: list[StrategyExample]
    python: list[PythonFile]


class SignalsRequest(BaseModel):
    symbol: Annotated[str, Field(min_length=1, max_length=20)]
    strategy: Strategy
    interval: Interval | None = Field(
        default=None, description="A decision interval of the profile; null = its default"
    )
    until: date | None = Field(default=None, description="Replay cursor (inclusive)")


Times = list[str] | list[int]


class SignalsResponse(BaseModel):
    symbol: str
    interval: Interval
    bars: int = Field(description="Decision bars evaluated (the whole history up to `until`)")
    long_entry: Times = Field(description="Bar times, as in /api/bars")
    long_exit: Times
    short_entry: Times
    short_exit: Times
    conflict: Times = Field(description="Both entries fire: the engine settles it (ADR 0036)")


def _field(document: Document, key: str) -> str:
    strategy = document.get("strategy")
    return (
        str(cast("dict[str, object]", strategy).get(key, "")) if isinstance(strategy, dict) else ""
    )


@router.get("/strategy-profiles", response_model=list[TraderProfile])
def list_profiles() -> list[TraderProfile]:
    """The four trader profiles."""
    return list(PROFILES.values())


@router.get("/strategies", response_model=StrategyCatalog)
def strategy_catalog(
    store: Annotated[DocumentStore, Depends(get_strategies)],
    files: Annotated[PythonStrategies, Depends(get_python_strategies)],
) -> StrategyCatalog:
    """Saved strategies (without their rules), the built-in examples and the Python files."""
    saved = [
        StrategySummary(
            name=name,
            revision=revision,
            updated_at=updated_at,
            kind=_field(doc, "kind"),
            profile=_field(doc, "profile"),
        )
        for name, revision, updated_at, doc in store.list()
    ]
    python: list[PythonFile] = []
    for name in files.names():
        try:
            m = files.load(name)
        except ChartLabError as e:
            python.append(PythonFile(module=name, description="", params=[], error=e.detail))
            continue
        params = [
            PythonParam(
                name=p.name, type=p.type, default=p.default, label=p.label, min=p.min, max=p.max
            )
            for p in m.params
        ]
        python.append(PythonFile(module=name, description=m.description, params=params, error=None))
    return StrategyCatalog(
        saved=saved,
        examples=[StrategyExample(name=n, strategy=s) for n, s in EXAMPLES.items()],
        python=python,
    )


@router.get("/strategies/{name}", response_model=StrategyDocument, responses=_NOT_FOUND)
def get_strategy(
    name: DocumentName, store: Annotated[DocumentStore, Depends(get_strategies)]
) -> StrategyDocument:
    found = store.get(name)
    if found is None:
        raise StrategyNotFoundError(f"No strategy named {name!r}")
    revision, document, updated_at = found
    return StrategyDocument(
        name=name,
        revision=revision,
        updated_at=updated_at,
        strategy=_STRATEGY.validate_python(document["strategy"]),
    )


@router.put("/strategies/{name}", response_model=StrategyDocument, responses=_CONFLICT)
def put_strategy(
    name: DocumentName,
    body: StrategyUpdate,
    store: Annotated[DocumentStore, Depends(get_strategies)],
) -> StrategyDocument:
    """Create (``revision`` 0) or replace a strategy; a stale ``revision`` is a 409."""
    document: Document = {
        "schema_version": SCHEMA_VERSION,
        "strategy": body.strategy.model_dump(mode="json"),
    }
    revision, updated_at = store.put(name, body.revision, document)
    return StrategyDocument(
        name=name, revision=revision, updated_at=updated_at, strategy=body.strategy
    )


@router.delete(
    "/strategies/{name}",
    status_code=HTTPStatus.NO_CONTENT,
    response_class=Response,
    responses={**_NOT_FOUND, **_CONFLICT},
)
def delete_strategy(
    name: DocumentName,
    revision: Annotated[int, Query(ge=0, description="Revision the client last read")],
    store: Annotated[DocumentStore, Depends(get_strategies)],
) -> None:
    store.delete(name, revision)


@dataclass(frozen=True, slots=True, eq=False)
class Evaluated:
    """A strategy's signals on a symbol's decision bars (the whole history up to ``until``)."""

    bars: BarsResult
    interval: Interval
    profile: TraderProfile
    signals: Signals


def evaluate(body: SignalsRequest, service: BarService, files: PythonStrategies) -> Evaluated:
    """The signals of ``body.strategy`` on ``body.symbol`` (shared with ``/backtest``)."""
    strategy = body.strategy
    profile = PROFILES[strategy.profile]
    interval = body.interval or profile.decision_intervals[0]
    if interval not in profile.decision_intervals:
        allowed = ", ".join(profile.decision_intervals)
        raise InvalidStrategyError(
            f"{interval} is not a decision interval of the {profile.label} profile ({allowed})"
        )
    # A rules strategy's context intervals are the profile's (validated), each longer than or equal
    # to its decision intervals (tested); an equal one is the decision bars (1M context, 1M bars).
    context = profile.context_for(interval)
    result = service.get_bars(body.symbol, interval, until=body.until, limit=HISTORY_LIMIT)

    def context_bars(iv: Interval) -> BarFrame:
        return service.get_bars(body.symbol, iv, until=body.until, limit=HISTORY_LIMIT).frame

    source = IndicatorSource(result.frame, interval, context_bars, context)
    signals = (
        rule_signals(strategy, source)
        if isinstance(strategy, RulesStrategy)
        else python_signals(files.load(strategy.module), strategy.params, source)
    )
    return Evaluated(result, interval, profile, signals)


def bar_times(times: IntArray, interval: Interval) -> Times:
    """Bar times as ``/api/bars`` gives them ('YYYY-MM-DD' daily and longer, epoch intraday)."""
    return [int(t) for t in times] if interval.is_intraday else ts_to_iso_dates(times)


@router.post("/strategies/signals", response_model=SignalsResponse)
def strategy_signals(
    body: SignalsRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    files: Annotated[PythonStrategies, Depends(get_python_strategies)],
) -> SignalsResponse:
    """Where the strategy enters and leaves, long and short, on the symbol's decision bars."""
    ev = evaluate(body, service, files)
    frame = ev.bars.frame

    def times(name: str) -> Times:
        return bar_times(frame.time[getattr(ev.signals, name)], ev.interval)

    return SignalsResponse(
        symbol=ev.bars.symbol.symbol,
        interval=ev.interval,
        bars=len(frame),
        long_entry=times("long_entry"),
        long_exit=times("long_exit"),
        short_entry=times("short_entry"),
        short_exit=times("short_exit"),
        conflict=times("conflict"),
    )
