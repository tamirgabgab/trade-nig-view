"""``GET /api/symbols`` - search the curated universe."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_universe
from app.data.universe import Universe
from app.models.symbols import SymbolInfo

router = APIRouter(tags=["symbols"])


@router.get("/symbols", response_model=list[SymbolInfo])
def list_symbols(
    universe: Annotated[Universe, Depends(get_universe)],
    query: Annotated[str, Query(max_length=50, description="Substring of symbol or name")] = "",
    group: Annotated[str | None, Query(description="Watchlist section, e.g. 'Stocks'")] = None,
) -> list[SymbolInfo]:
    """Symbols in universe order (which is also the default watchlist order)."""
    return universe.search(query, group)
