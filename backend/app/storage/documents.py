"""Named JSON documents in one SQLite table of ``app.db``, with a revision for optimistic locking.

Used for layouts and watchlists (one ``DocumentStore`` per table). Each document carries its
``schema_version``; ``migrate`` upgrades a stored document to the current schema when it is read.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

from app.errors import ChartLabError, RevisionConflictError

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS {table} (
    name       TEXT PRIMARY KEY,
    revision   INTEGER NOT NULL,
    document   TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
)
"""

Document = dict[str, object]


def migrate(document: Document) -> Document:
    """Bring a stored document to ``SCHEMA_VERSION`` (pure). v1 is current: nothing to do yet.

    A future v2 adds a ``_v1_to_v2`` step here; documents from a newer app version are refused.
    """
    version = document.get("schema_version", 1)
    if not isinstance(version, int) or version > SCHEMA_VERSION:
        raise ValueError(f"unsupported document schema version {version!r}")
    return {**document, "schema_version": SCHEMA_VERSION}


class DocumentStore:
    """Thread-safe (one lock) access to the named documents of one table.

    ``not_found`` is the (404) error raised when a deleted document does not exist.
    """

    def __init__(self, path: Path, table: str, not_found: type[ChartLabError]) -> None:
        if not table.isidentifier():
            raise ValueError(f"invalid table name {table!r}")
        path.parent.mkdir(parents=True, exist_ok=True)
        self._table = table
        self._not_found = not_found
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock, self._conn:
            self._conn.execute(_SCHEMA.format(table=table))

    def get(self, name: str) -> tuple[int, Document, str] | None:
        """``(revision, document, updated_at)``, or ``None`` when ``name`` is not stored."""
        with self._lock:
            row = self._conn.execute(
                f"SELECT revision, document, updated_at FROM {self._table} WHERE name = ?",  # noqa: S608 - table is an identifier
                (name,),
            ).fetchone()
        if row is None:
            return None
        return int(row[0]), migrate(json.loads(row[1])), str(row[2])

    def put(self, name: str, revision: int, document: Document) -> tuple[int, str]:
        """Store ``document`` if ``revision`` is the stored one (0 = not stored yet).

        Returns ``(new_revision, updated_at)``; raises ``RevisionConflictError`` otherwise.
        """
        with self._lock, self._conn:
            current = self._revision(name)
            if revision != current:
                raise RevisionConflictError(
                    f"{name!r} changed elsewhere (revision {current}, this window had "
                    f"{revision}). Reload it, then save again."
                )
            self._conn.execute(
                f"INSERT INTO {self._table} (name, revision, document) VALUES (?, ?, ?) "  # noqa: S608 - table is an identifier
                "ON CONFLICT(name) DO UPDATE SET revision = excluded.revision, "
                "document = excluded.document, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
                (name, current + 1, json.dumps(document)),
            )
            row = self._conn.execute(
                f"SELECT updated_at FROM {self._table} WHERE name = ?",  # noqa: S608 - table is an identifier
                (name,),
            ).fetchone()
        return current + 1, str(row[0])

    def delete(self, name: str, revision: int) -> None:
        """Remove ``name``; ``not_found`` when missing, ``RevisionConflictError`` when stale."""
        with self._lock, self._conn:
            current = self._revision(name)
            if current == 0:
                raise self._not_found(f"Nothing named {name!r} is saved")
            if revision != current:
                raise RevisionConflictError(
                    f"{name!r} changed elsewhere (revision {current}, this window had "
                    f"{revision}). Reload it, then delete again."
                )
            self._conn.execute(f"DELETE FROM {self._table} WHERE name = ?", (name,))  # noqa: S608 - table is an identifier

    def list(self) -> list[tuple[str, int, str, Document]]:
        """``(name, revision, updated_at, document)`` of every document, newest first."""
        with self._lock:
            rows = self._conn.execute(
                f"SELECT name, revision, updated_at, document FROM {self._table} "  # noqa: S608 - table is an identifier
                "ORDER BY updated_at DESC, name"
            ).fetchall()
        return [(str(n), int(r), str(u), migrate(json.loads(d))) for n, r, u, d in rows]

    def close(self) -> None:
        self._conn.close()

    def _revision(self, name: str) -> int:
        """Stored revision of ``name`` (0 = not stored); call with the lock held."""
        row = self._conn.execute(
            f"SELECT revision FROM {self._table} WHERE name = ?",  # noqa: S608 - table is an identifier
            (name,),
        ).fetchone()
        return 0 if row is None else int(row[0])
