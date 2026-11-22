"""The committed API contract (frontend/src/api/openapi.json) matches the backend."""

from __future__ import annotations

from pathlib import Path

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
