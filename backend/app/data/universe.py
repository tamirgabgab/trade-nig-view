"""Load and query the curated symbol universe (``backend/config/universe.toml``), plus the user's
synthetic symbols (``app.storage.synthetic``) when they are attached with :meth:`with_extra`."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from app.models.symbols import SymbolInfo


class ExtraSymbols(Protocol):
    """Symbols defined at run time (the synthetic ones), looked up after the curated universe."""

    def info(self, symbol: str) -> SymbolInfo | None: ...

    def infos(self) -> list[SymbolInfo]: ...


class _UniverseFile(BaseModel):
    symbols: list[SymbolInfo]


class Universe:
    """Ordered, read-only collection of symbols with case-insensitive lookup; ``resolve`` and
    ``search`` also see the attached extra symbols, ``symbols`` is the curated list only."""

    def __init__(self, symbols: list[SymbolInfo], extra: ExtraSymbols | None = None) -> None:
        self._symbols = tuple(symbols)
        self._extra = extra
        self._by_key: dict[str, SymbolInfo] = {}
        for info in symbols:
            for key in {info.symbol.upper(), info.display.upper()}:
                existing = self._by_key.get(key)
                if existing is not None and existing.symbol != info.symbol:
                    raise ValueError(f"Duplicate symbol or display name in universe: {key}")
                self._by_key[key] = info

    @classmethod
    def load(cls, path: Path) -> Universe:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
        return cls(_UniverseFile.model_validate(data).symbols)

    def with_extra(self, extra: ExtraSymbols) -> Universe:
        """The same universe, also resolving and searching ``extra``."""
        return Universe(list(self._symbols), extra)

    @property
    def symbols(self) -> tuple[SymbolInfo, ...]:
        """The curated universe (the default watchlist), without the extra symbols."""
        return self._symbols

    def resolve(self, symbol_or_display: str) -> SymbolInfo | None:
        """Find a symbol by provider symbol (``^GSPC``) or display name (``SPX``)."""
        key = symbol_or_display.strip().upper()
        found = self._by_key.get(key)
        if found is None and self._extra is not None:
            return self._extra.info(key)
        return found

    def search(self, query: str = "", group: str | None = None) -> list[SymbolInfo]:
        """Case-insensitive substring search over symbol, display name and full name."""
        needle = query.strip().lower()
        results: list[SymbolInfo] = []
        extra = [] if self._extra is None else self._extra.infos()
        for info in (*self._symbols, *extra):
            if group is not None and info.group.lower() != group.lower():
                continue
            haystack = f"{info.symbol} {info.display} {info.name}".lower()
            if needle in haystack:
                results.append(info)
        return results
