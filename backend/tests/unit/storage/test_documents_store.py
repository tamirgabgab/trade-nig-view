from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.errors import ChartLabError, RevisionConflictError
from app.storage.documents import DocumentStore, migrate


class MissingError(ChartLabError):
    status = 404
    code = "missing"


def store(tmp_path: Path, table: str = "layouts") -> DocumentStore:
    return DocumentStore(tmp_path / "app.db", table, MissingError)


def test_create_bump_and_reopen(tmp_path: Path) -> None:
    repo = store(tmp_path)
    assert repo.get("Main") is None
    first, stamp = repo.put("Main", 0, {"symbol": "AAA"})
    second, _ = repo.put("Main", first, {"symbol": "BBB"})
    assert (first, second) == (1, 2)
    assert stamp.endswith("Z")
    repo.close()

    found = store(tmp_path).get("Main")
    assert found is not None
    assert found[:2] == (2, {"symbol": "BBB", "schema_version": 1})


@pytest.mark.parametrize("stale", [0, 2])
def test_a_stale_revision_is_a_conflict(tmp_path: Path, stale: int) -> None:
    repo = store(tmp_path)
    repo.put("Main", 0, {"a": 1})
    with pytest.raises(RevisionConflictError, match="revision 1"):
        repo.put("Main", stale, {"a": 2})
    found = repo.get("Main")
    assert found is not None
    assert found[:2] == (1, {"a": 1, "schema_version": 1})


def test_delete_checks_existence_and_revision(tmp_path: Path) -> None:
    repo = store(tmp_path)
    with pytest.raises(MissingError):
        repo.delete("Main", 1)
    repo.put("Main", 0, {})
    with pytest.raises(RevisionConflictError):
        repo.delete("Main", 0)
    repo.delete("Main", 1)
    assert repo.get("Main") is None
    assert repo.put("Main", 0, {})[0] == 1  # created afresh


def test_list_is_newest_first_then_by_name(tmp_path: Path) -> None:
    repo = store(tmp_path)
    stamps = {"c": "2026-06-01T00:00:00Z", "a": "2026-06-01T00:00:00Z", "b": "2026-06-02T00:00:00Z"}
    for name in stamps:
        repo.put(name, 0, {"n": name})
    with sqlite3.connect(tmp_path / "app.db") as conn:
        conn.executemany(
            "UPDATE layouts SET updated_at = ? WHERE name = ?",
            [(stamp, name) for name, stamp in stamps.items()],
        )
    conn.close()
    rows = repo.list()
    assert [row[0] for row in rows] == ["b", "a", "c"]
    assert rows[0] == ("b", 1, "2026-06-02T00:00:00Z", {"n": "b", "schema_version": 1})


def test_tables_are_independent(tmp_path: Path) -> None:
    layouts, watchlists = store(tmp_path), store(tmp_path, "watchlists")
    layouts.put("Main", 0, {})
    assert watchlists.get("Main") is None
    assert watchlists.list() == []


def test_table_name_must_be_an_identifier(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="table"):
        store(tmp_path, "x; DROP TABLE drawings")


def test_migrate_keeps_v1_and_refuses_a_newer_schema() -> None:
    assert migrate({"sections": []}) == {"sections": [], "schema_version": 1}
    with pytest.raises(ValueError, match="unsupported"):
        migrate({"schema_version": 99})
