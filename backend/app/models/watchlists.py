"""Watchlist document: named, ordered sections of symbols.

Symbols are checked against the universe (and stored canonical) by the endpoint
(``app.api.watchlists``), which also rejects a symbol listed twice.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = 1
MAX_SECTIONS = 30
MAX_SYMBOLS = 200
DEFAULT_WATCHLIST = "Default"


class WatchlistSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=40)
    symbols: list[str] = Field(max_length=MAX_SYMBOLS)


class WatchlistUpdate(BaseModel):
    """``PUT`` body: every section, and the revision it was based on (optimistic locking)."""

    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0, description="Revision the client last read; 0 = create")
    sections: list[WatchlistSection] = Field(min_length=1, max_length=MAX_SECTIONS)


class WatchlistDocument(BaseModel):
    schema_version: int = SCHEMA_VERSION
    name: str
    revision: int = Field(ge=0, description="Bumped by every save; 0 = the unsaved default")
    updated_at: str = Field(description="UTC ISO time of the last save; '' when never saved")
    sections: list[WatchlistSection]


class WatchlistList(BaseModel):
    watchlists: list[WatchlistDocument] = Field(
        description=f"Newest first; one unsaved '{DEFAULT_WATCHLIST}' list when none is saved"
    )
