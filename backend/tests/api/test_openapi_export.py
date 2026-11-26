"""The committed API contract (frontend/src/api/openapi.json) matches the backend."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest

from app import openapi_export


def test_committed_openapi_is_up_to_date() -> None:
    committed = openapi_export.OPENAPI_FILE.read_text(encoding="utf-8")
    assert committed == openapi_export.openapi_text(), (
        "frontend/src/api/openapi.json is stale: run scripts/gen-api.ps1 (or .sh) and commit"
    )


def test_bar_time_is_string_or_integer() -> None:
    bar = openapi_export.openapi_schema()["components"]["schemas"]["Bar"]
    assert {kind["type"] for kind in bar["properties"]["time"]["anyOf"]} == {"string", "integer"}


def test_main_writes_the_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "openapi.json"
    monkeypatch.setattr(openapi_export, "OPENAPI_FILE", target)
    monkeypatch.setattr(openapi_export, "REPO_ROOT", tmp_path)
    assert openapi_export.main() == 0
    assert target.read_text(encoding="utf-8") == openapi_export.openapi_text()


def test_the_schema_leaves_no_database_open(monkeypatch: pytest.MonkeyPatch) -> None:
    """The schema is built on a throw-away data directory. Windows cannot delete a database
    that is still open, so every connection made on the way is closed before it goes."""
    opened: list[sqlite3.Connection] = []
    real = sqlite3.connect

    def connect(*args: Any, **kwargs: Any) -> sqlite3.Connection:
        opened.append(real(*args, **kwargs))
        return opened[-1]

    monkeypatch.setattr(sqlite3, "connect", connect)
    openapi_export.openapi_schema()
    assert opened  # app.db was opened: the test watches the right door
    for connection in opened:
        with pytest.raises(sqlite3.ProgrammingError, match="closed"):
            connection.execute("SELECT 1")
