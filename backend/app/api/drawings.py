"""``GET/PUT /api/drawings/{symbol}`` - the chart drawings of a symbol (shared by all intervals)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_drawings, get_universe
from app.data.universe import Universe
from app.errors import SymbolNotFoundError
from app.models.drawings import DrawingsDocument, DrawingsUpdate
from app.storage.drawings import DrawingsRepository

router = APIRouter(tags=["drawings"])


def _known(universe: Universe, symbol: str) -> str:
    info = universe.resolve(symbol)
    if info is None:
        raise SymbolNotFoundError(f"Unknown symbol {symbol!r}")
    return info.symbol


@router.get("/drawings/{symbol}", response_model=DrawingsDocument)
def get_drawings_of(
    symbol: str,
    universe: Annotated[Universe, Depends(get_universe)],
    repo: Annotated[DrawingsRepository, Depends(get_drawings)],
) -> DrawingsDocument:
    """The drawings (revision 0 and none when nothing was saved yet)."""
    return repo.get(_known(universe, symbol))


@router.put(
    "/drawings/{symbol}",
    response_model=DrawingsDocument,
    responses={409: {"description": "Saved meanwhile elsewhere: reload (problem+json)"}},
)
def put_drawings_of(
    symbol: str,
    body: DrawingsUpdate,
    universe: Annotated[Universe, Depends(get_universe)],
    repo: Annotated[DrawingsRepository, Depends(get_drawings)],
) -> DrawingsDocument:
    """Replace the drawings; ``revision`` must be the one last read (else 409 revision_conflict)."""
    return repo.put(_known(universe, symbol), body.revision, body.drawings)
