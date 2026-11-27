"""``/api/synthetic`` - the user's synthetic symbols (Phase K, ADR 0031).

A definition is edited in place (``PUT`` with its revision); before an edit or a delete the page
shows what points at the symbol (``GET …/references``). Deleting removes the symbol from every
saved watchlist and deletes its drawings first, then the definition; layouts and Planner scenarios
keep their text (a layout then opens on the default symbol, a scenario reports the symbol missing).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict
from http import HTTPStatus
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import BaseModel, Field

from app.api.deps import (
    get_drawings,
    get_layouts,
    get_scenarios,
    get_synthetic,
    get_watchlists,
)
from app.data.synthetic_returns import preview
from app.errors import ChartLabError
from app.models.synthetic import DwellingDefinition, ReturnShape, SyntheticDefinition
from app.storage.documents import Document, DocumentStore
from app.storage.drawings import DrawingsRepository
from app.storage.synthetic import SyntheticNotFoundError, SyntheticSymbols

router = APIRouter(tags=["synthetic"])

SymbolPath = Annotated[
    str, Path(min_length=5, max_length=16, description="The symbol, e.g. 'SYN:WALK1'")
]
_CONFLICT: dict[int | str, dict[str, Any]] = {
    409: {"description": "Saved meanwhile elsewhere: reload (problem+json)"}
}
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "No synthetic symbol with this name (problem+json)"}
}


class InvalidSyntheticError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_synthetic"


class SyntheticOut(BaseModel):
    symbol: str
    revision: int
    last_date: dt.date | None = Field(
        description="The date of the last daily bar; null for a dwelling symbol (its data sets it)"
    )
    definition: SyntheticDefinition


class SyntheticUpdate(BaseModel):
    """``PUT`` body: the definition and the revision it was based on (0 creates)."""

    revision: int = Field(ge=0)
    definition: SyntheticDefinition


class SyntheticReferences(BaseModel):
    """What points at a symbol (shown before it is edited or deleted)."""

    layouts: list[str] = Field(description="Saved layouts charting it")
    compared_in: list[str] = Field(description="Saved layouts comparing it")
    watchlists: list[str]
    drawings: int = Field(description="Its number of drawings")
    scenarios: list[str] = Field(description="Saved Planner scenarios that mention it")


def _out(revision: int, definition: SyntheticDefinition) -> SyntheticOut:
    last = None if isinstance(definition, DwellingDefinition) else definition.last_date
    return SyntheticOut(
        symbol=definition.symbol, revision=revision, last_date=last, definition=definition
    )


def _found(store: SyntheticSymbols, symbol: str) -> tuple[int, SyntheticDefinition]:
    found = store.get(symbol)
    if found is None:
        raise SyntheticNotFoundError(f"No synthetic symbol {symbol!r}")
    return found


def _mentions(value: object, symbol: str) -> bool:
    """Whether ``symbol`` appears as a whole string anywhere in a JSON document."""
    if isinstance(value, str):
        return value.upper() == symbol
    if isinstance(value, dict):
        value = list(cast("dict[str, object]", value).values())
    if isinstance(value, list):
        return any(_mentions(v, symbol) for v in cast("list[object]", value))
    return False


def _without(document: Document, symbol: str) -> Document | None:
    """The watchlist ``document`` without ``symbol``, or None when it does not hold it."""
    sections = cast("list[dict[str, Any]]", document["sections"])
    if not any(symbol in section["symbols"] for section in sections):
        return None
    return {
        **document,
        "sections": [
            {**section, "symbols": [s for s in section["symbols"] if s != symbol]}
            for section in sections
        ],
    }


class PreviewRequest(ReturnShape):
    """A parametric symbol's statistics, its seed and its length (no name needed)."""

    seed: Annotated[int, Field(ge=0, le=1_000_000)]
    bars: Annotated[int, Field(ge=100, le=10_000)] = 2500


class PreviewOut(BaseModel):
    """What a parametric symbol draws: its daily returns as a histogram (``edges``, ``counts``),
    the family's density as expected counts per bin at ``curve_x``, the realized yearly mean and
    volatility (%), skewness and excess kurtosis, the family's own (null: no finite value), and
    the days the floor of -99 % caught."""

    edges: list[float]
    counts: list[int]
    curve_x: list[float]
    curve_counts: list[float]
    mean_pct: float
    vol_pct: float
    skewness: float
    excess_kurtosis: float
    family_skewness: float | None
    family_excess_kurtosis: float | None
    floored: int


@router.post("/synthetic/preview", response_model=PreviewOut)
def preview_synthetic(body: PreviewRequest) -> PreviewOut:
    """The returns a parametric symbol with these statistics draws (the dialog's preview)."""
    return PreviewOut.model_validate(asdict(preview(body, body.bars - 1, body.seed)))


@router.get("/synthetic", response_model=list[SyntheticOut])
def list_synthetic(
    store: Annotated[SyntheticSymbols, Depends(get_synthetic)],
) -> list[SyntheticOut]:
    """Every synthetic symbol, by symbol."""
    return [_out(revision, definition) for revision, definition in store.all()]


@router.get("/synthetic/{symbol}", response_model=SyntheticOut, responses=_NOT_FOUND)
def get_synthetic_symbol(
    symbol: SymbolPath, store: Annotated[SyntheticSymbols, Depends(get_synthetic)]
) -> SyntheticOut:
    """One synthetic symbol's definition."""
    return _out(*_found(store, symbol))


@router.get(
    "/synthetic/{symbol}/references", response_model=SyntheticReferences, responses=_NOT_FOUND
)
def synthetic_references(
    symbol: SymbolPath,
    store: Annotated[SyntheticSymbols, Depends(get_synthetic)],
    layouts: Annotated[DocumentStore, Depends(get_layouts)],
    watchlists: Annotated[DocumentStore, Depends(get_watchlists)],
    scenarios: Annotated[DocumentStore, Depends(get_scenarios)],
    drawings: Annotated[DrawingsRepository, Depends(get_drawings)],
) -> SyntheticReferences:
    """The saved layouts, watchlists, drawings and Planner scenarios that point at ``symbol``."""
    key = _found(store, symbol)[1].symbol
    saved_layouts = layouts.list()
    return SyntheticReferences(
        layouts=[name for name, _, _, doc in saved_layouts if doc.get("symbol") == key],
        compared_in=[
            name
            for name, _, _, doc in saved_layouts
            if key in cast("list[str]", doc.get("compare", []))
        ],
        watchlists=[name for name, _, _, doc in watchlists.list() if _without(doc, key)],
        drawings=len(drawings.get(key).drawings),
        scenarios=[name for name, _, _, doc in scenarios.list() if _mentions(doc, key)],
    )


@router.put(
    "/synthetic/{symbol}",
    response_model=SyntheticOut,
    responses={**_CONFLICT, 422: {"description": "Invalid definition (problem+json)"}},
)
def put_synthetic(
    symbol: SymbolPath,
    body: SyntheticUpdate,
    store: Annotated[SyntheticSymbols, Depends(get_synthetic)],
) -> SyntheticOut:
    """Create (``revision`` 0) or edit a synthetic symbol in place; a stale ``revision`` is a 409.

    The symbol is ``SYN:`` plus the definition's ``name`` and must match the path; a name already
    taken is a 409 too (the stored revision is not 0). The last bar must be before today.
    """
    definition = body.definition
    if symbol.strip().upper() != definition.symbol:
        raise InvalidSyntheticError(f"The path says {symbol!r}, the body {definition.symbol!r}")
    today = dt.datetime.now(dt.UTC).date()
    # Before today: today's hours would still be in the future somewhere in the day. (A dwelling
    # symbol's dates come from its index; a causal one stops before today by itself.)
    if not isinstance(definition, DwellingDefinition) and definition.last_date >= today:
        raise InvalidSyntheticError(
            f"{definition.bars} bars from {definition.first_date} end on {definition.last_date},"
            f" not before today ({today}): start earlier or use fewer bars"
        )
    return _out(store.put(definition, body.revision), definition)


@router.delete(
    "/synthetic/{symbol}",
    status_code=HTTPStatus.NO_CONTENT,
    response_class=Response,
    responses={**_NOT_FOUND, **_CONFLICT},
)
def delete_synthetic(
    symbol: SymbolPath,
    revision: Annotated[int, Query(ge=0, description="Revision the client last read")],
    store: Annotated[SyntheticSymbols, Depends(get_synthetic)],
    watchlists: Annotated[DocumentStore, Depends(get_watchlists)],
    drawings: Annotated[DrawingsRepository, Depends(get_drawings)],
) -> None:
    """Delete a synthetic symbol: out of every watchlist, its drawings, then the definition.

    The clean-up runs under the store's lock after the revision check, so no edit can slip in
    between; a watchlist saved meanwhile elsewhere is a 409 that leaves the symbol in place.
    """
    key = _found(store, symbol)[1].symbol

    def clean_up() -> None:
        for name, watchlist_revision, _, document in watchlists.list():
            cleaned = _without(document, key)
            if cleaned is not None:
                watchlists.put(name, watchlist_revision, cleaned)
        drawings.delete(key)

    store.delete(key, revision, before=clean_up)
