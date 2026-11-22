"""Load and query the curated symbol universe (``backend/config/universe.toml``)."""

from __future__ import annotations

import tomllib
from pathlib import Path

from pydantic import BaseModel

from app.models.symbols import SymbolInfo


class _UniverseFile(BaseModel):
    symbols: list[SymbolInfo]


class Universe:
    """Ordered, read-only collection of symbols with case-insensitive lookup."""

    def __init__(self, symbols: list[SymbolInfo]) -> None:
        self._symbols = tuple(symbols)
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

    @property
    def symbols(self) -> tuple[SymbolInfo, ...]:
        return self._symbols

    def resolve(self, symbol_or_display: str) -> SymbolInfo | None:
        """Find a symbol by provider symbol (``^GSPC``) or display name (``SPX``)."""
        return self._by_key.get(symbol_or_display.strip().upper())

    def search(self, query: str = "", group: str | None = None) -> list[SymbolInfo]:
        """Case-insensitive substring search over symbol, display name and full name."""
        needle = query.strip().lower()
        results: list[SymbolInfo] = []
        for info in self._symbols:
            if group is not None and info.group.lower() != group.lower():
                continue
            haystack = f"{info.symbol} {info.display} {info.name}".lower()
            if needle in haystack:
                results.append(info)
        return results
