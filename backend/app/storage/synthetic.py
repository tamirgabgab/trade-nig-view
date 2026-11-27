"""The saved synthetic symbols (``app.db`` table ``synthetic``) with an in-memory index.

The index answers every symbol lookup (``Universe.resolve`` asks it for any symbol outside the
curated universe), so reading a definition never touches SQLite; writes go to SQLite first.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from http import HTTPStatus
from pathlib import Path

from app.errors import ChartLabError, RevisionConflictError
from app.models.symbols import SymbolInfo
from app.models.synthetic import DEFINITION, MAX_DEFINITIONS, SyntheticDefinition
from app.storage.documents import Document, DocumentStore

SCHEMA_VERSION = 1


class SyntheticNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "synthetic_not_found"


class TooManySyntheticError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "too_many_synthetic"


class SyntheticSymbols:
    """Thread-safe store of definitions keyed by symbol (``SYN:NAME``)."""

    def __init__(self, path: Path) -> None:
        self._store = DocumentStore(path, "synthetic", SyntheticNotFoundError)
        self._lock = threading.Lock()
        self._saved: dict[str, tuple[int, SyntheticDefinition]] = {
            name: (revision, DEFINITION.validate_python(_body(document)))
            for name, revision, _, document in self._store.list()
        }

    def get(self, symbol: str) -> tuple[int, SyntheticDefinition] | None:
        """``(revision, definition)`` of ``symbol`` (any case), or None."""
        return self._saved.get(symbol.strip().upper())

    def definition(self, symbol: str) -> SyntheticDefinition | None:
        found = self.get(symbol)
        return None if found is None else found[1]

    def info(self, symbol: str) -> SymbolInfo | None:
        found = self.definition(symbol)
        return None if found is None else found.info()

    def all(self) -> list[tuple[int, SyntheticDefinition]]:
        """Every definition, by symbol."""
        return [self._saved[s] for s in sorted(self._saved)]

    def infos(self) -> list[SymbolInfo]:
        return [definition.info() for _, definition in self.all()]

    def put(self, definition: SyntheticDefinition, revision: int) -> int:
        """Create (``revision`` 0) or replace; returns the new revision (409 when stale)."""
        symbol = definition.symbol
        with self._lock:
            if revision == 0 and symbol not in self._saved and len(self._saved) >= MAX_DEFINITIONS:
                raise TooManySyntheticError(
                    f"At most {MAX_DEFINITIONS} synthetic symbols: delete one first"
                )
            document: Document = {
                "schema_version": SCHEMA_VERSION,
                **definition.model_dump(mode="json"),
            }
            new_revision, _ = self._store.put(symbol, revision, document)
            self._saved[symbol] = (new_revision, definition)
        return new_revision

    def delete(self, symbol: str, revision: int, before: Callable[[], None]) -> None:
        """Remove ``symbol`` (404 when missing, 409 when stale), running ``before`` first once the
        revision is checked, under the lock (so no edit comes in between)."""
        key = symbol.strip().upper()
        with self._lock:
            stored = self._saved.get(key)
            if stored is None:
                raise SyntheticNotFoundError(f"No synthetic symbol {key!r}")
            if stored[0] != revision:
                raise RevisionConflictError(
                    f"{key} changed elsewhere (revision {stored[0]}, this window had {revision})."
                    " Reload it, then delete again."
                )
            before()
            self._store.delete(key, revision)
            del self._saved[key]

    def close(self) -> None:
        self._store.close()


def _body(document: Document) -> Document:
    return {k: v for k, v in document.items() if k != "schema_version"}
