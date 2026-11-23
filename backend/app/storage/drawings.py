"""Drawings per symbol in SQLite (``app.db``), with a revision for optimistic locking.

Stored as one JSON document per symbol (``schema_version`` inside); ``migrate`` upgrades a stored
document to the current schema when it is read.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

from app.errors import ChartLabError
from app.models.drawings import SCHEMA_VERSION, Drawing, DrawingsDocument

_SCHEMA = """
CREATE TABLE IF NOT EXISTS drawings (
    symbol     TEXT PRIMARY KEY,
    revision   INTEGER NOT NULL,
    document   TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
)
"""


class RevisionConflictError(ChartLabError):
    """The client saved on top of an older revision (another tab or window saved meanwhile)."""

    status = 409
    code = "revision_conflict"


def migrate(document: dict[str, object]) -> dict[str, object]:
    """Bring a stored document to ``SCHEMA_VERSION`` (pure). v1 is current: nothing to do yet.

    A future v2 adds a ``_v1_to_v2`` step here; documents from a newer app version are refused.
    """
    version = document.get("schema_version", 1)
    if not isinstance(version, int) or version > SCHEMA_VERSION:
        raise ValueError(f"unsupported drawings schema version {version!r}")
    return {**document, "schema_version": SCHEMA_VERSION}


class DrawingsRepository:
    """Thread-safe (one lock) access to the ``drawings`` table."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock, self._conn:
            self._conn.execute(_SCHEMA)

    def get(self, symbol: str) -> DrawingsDocument:
        """The symbol's drawings; an empty document (revision 0) when none were saved."""
        with self._lock:
            row = self._conn.execute(
                "SELECT document FROM drawings WHERE symbol = ?", (symbol,)
            ).fetchone()
        if row is None:
            return DrawingsDocument(symbol=symbol, revision=0, drawings=[])
        return DrawingsDocument.model_validate(migrate(json.loads(row[0])))

    def put(self, symbol: str, revision: int, drawings: list[Drawing]) -> DrawingsDocument:
        """Replace the symbol's drawings if ``revision`` is the stored one; return the new doc."""
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT revision FROM drawings WHERE symbol = ?", (symbol,)
            ).fetchone()
            current = 0 if row is None else int(row[0])
            if revision != current:
                raise RevisionConflictError(
                    f"The drawings of {symbol} changed elsewhere (revision {current}, "
                    f"this window had {revision}). Reload them, then draw again."
                )
            document = DrawingsDocument(symbol=symbol, revision=current + 1, drawings=drawings)
            self._conn.execute(
                "INSERT INTO drawings (symbol, revision, document) VALUES (?, ?, ?) "
                "ON CONFLICT(symbol) DO UPDATE SET revision = excluded.revision, "
                "document = excluded.document, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
                (symbol, document.revision, document.model_dump_json()),
            )
        return document

    def close(self) -> None:
        self._conn.close()
