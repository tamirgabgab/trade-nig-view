"""``/api/watchlists`` - named watchlists; an unsaved ``Default`` one until the first save."""

from __future__ import annotations

from http import HTTPStatus
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_universe, get_watchlists
from app.data.universe import Universe
from app.errors import ChartLabError
from app.models.layouts import DocumentName
from app.models.watchlists import (
    DEFAULT_WATCHLIST,
    MAX_SYMBOLS,
    SCHEMA_VERSION,
    WatchlistDocument,
    WatchlistList,
    WatchlistSection,
    WatchlistUpdate,
)
from app.storage.documents import Document, DocumentStore

router = APIRouter(tags=["watchlists"])

_CONFLICT: dict[int | str, dict[str, Any]] = {
    409: {"description": "Saved meanwhile elsewhere: reload (problem+json)"}
}
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "No watchlist with this name (problem+json)"}
}


class WatchlistNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "watchlist_not_found"


class InvalidWatchlistError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_watchlist"


def _document(name: str, revision: int, updated_at: str, document: Document) -> WatchlistDocument:
    return WatchlistDocument.model_validate(
        {**document, "name": name, "revision": revision, "updated_at": updated_at}
    )


def default_watchlist(universe: Universe) -> WatchlistDocument:
    """The universe's groups as sections, in universe order (never saved until a ``PUT``)."""
    groups: dict[str, list[str]] = {}
    for info in universe.symbols:
        groups.setdefault(info.group, []).append(info.symbol)
    return WatchlistDocument(
        name=DEFAULT_WATCHLIST,
        revision=0,
        updated_at="",
        sections=[WatchlistSection(title=t, symbols=s) for t, s in groups.items()],
    )


def _canonical(universe: Universe, sections: list[WatchlistSection]) -> list[WatchlistSection]:
    """Sections with canonical symbols; unknown, repeated or too many symbols, or two sections
    with one title, are a 422."""
    titles = [s.title for s in sections]
    if len(set(titles)) != len(titles):
        raise InvalidWatchlistError("Two sections have the same title")
    seen: set[str] = set()
    result: list[WatchlistSection] = []
    for section in sections:
        symbols: list[str] = []
        for raw in section.symbols:
            info = universe.resolve(raw)
            if info is None:
                raise InvalidWatchlistError(f"Unknown symbol {raw!r}")
            if info.symbol in seen:
                raise InvalidWatchlistError(f"{info.symbol} is listed twice")
            seen.add(info.symbol)
            symbols.append(info.symbol)
        result.append(WatchlistSection(title=section.title, symbols=symbols))
    if len(seen) > MAX_SYMBOLS:
        raise InvalidWatchlistError(f"A watchlist holds at most {MAX_SYMBOLS} symbols")
    return result


@router.get("/watchlists", response_model=WatchlistList)
def list_watchlists(
    universe: Annotated[Universe, Depends(get_universe)],
    store: Annotated[DocumentStore, Depends(get_watchlists)],
) -> WatchlistList:
    """Every saved watchlist, newest first; just the unsaved ``Default`` when none is saved."""
    saved = [_document(*row) for row in store.list()]
    return WatchlistList(watchlists=saved or [default_watchlist(universe)])


@router.put("/watchlists/{name}", response_model=WatchlistDocument, responses=_CONFLICT)
def put_watchlist(
    name: DocumentName,
    body: WatchlistUpdate,
    universe: Annotated[Universe, Depends(get_universe)],
    store: Annotated[DocumentStore, Depends(get_watchlists)],
) -> WatchlistDocument:
    """Create (``revision`` 0) or replace a watchlist; a stale ``revision`` is a 409."""
    sections = _canonical(universe, body.sections)
    document: Document = {
        "schema_version": SCHEMA_VERSION,
        "sections": [s.model_dump(mode="json") for s in sections],
    }
    revision, updated_at = store.put(name, body.revision, document)
    return _document(name, revision, updated_at, document)


@router.delete(
    "/watchlists/{name}",
    status_code=HTTPStatus.NO_CONTENT,
    response_class=Response,
    responses={**_NOT_FOUND, **_CONFLICT},
)
def delete_watchlist(
    name: DocumentName,
    revision: Annotated[int, Query(ge=0, description="Revision the client last read")],
    store: Annotated[DocumentStore, Depends(get_watchlists)],
) -> None:
    """Delete a watchlist; a stale ``revision`` is a 409."""
    store.delete(name, revision)
