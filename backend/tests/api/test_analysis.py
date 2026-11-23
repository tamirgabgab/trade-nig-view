"""``GET /api/analysis/gaps`` in offline mode."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import IsolatedSettings

E2E_DATA = Path(__file__).resolve().parents[3] / "frontend" / "e2e" / "data"
NVDA_GAPS: dict[str, Any] = json.loads(
    (Path(__file__).resolve().parents[1] / "golden" / "nvda_gaps.json").read_text(encoding="utf-8")
)


@pytest.fixture
def e2e_client(tmp_path: Path) -> Iterator[TestClient]:
    """The synthetic e2e universe (thousands of daily bars per symbol, so there are gaps)."""
    settings = IsolatedSettings(
        offline=True,
        chartlab_data_dir=tmp_path / "data",
        universe_file=E2E_DATA / "universe.toml",
        fixtures_dir=E2E_DATA,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def gaps(client: TestClient, **params: str | float) -> dict[str, Any]:
    response = client.get("/api/analysis/gaps", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_nvda_gaps_match_the_golden_file(e2e_client: TestClient) -> None:
    body = gaps(e2e_client, symbol="NVDA", adjusted="false")
    assert (body["symbol"], body["interval"]) == ("NVDA", "1D")
    assert body["gaps"] == NVDA_GAPS["gaps"]
    times = [g["time"] for g in body["gaps"]]
    assert times == sorted(times)


def test_until_hides_later_gaps_and_fills(e2e_client: TestClient) -> None:
    full = gaps(e2e_client, symbol="NVDA", adjusted="false")["gaps"]
    # the last gap that was filled on a later bar: replay to the day it opened
    gap = next(g for g in reversed(full) if g["filled_time"] and g["filled_time"] > g["time"])
    replay = gaps(e2e_client, symbol="NVDA", adjusted="false", until=gap["time"])["gaps"]
    assert replay[-1]["time"] == gap["time"]
    assert replay[-1]["filled_time"] is None
    assert len(replay) == len([g for g in full if g["time"] <= gap["time"]])
    assert all(g["filled_time"] is None or g["filled_time"] <= gap["time"] for g in replay)


def test_partial_gaps_and_min_pct(e2e_client: TestClient) -> None:
    full_only = gaps(e2e_client, symbol="AAPL", min_pct=0.5)["gaps"]
    with_partial = gaps(e2e_client, symbol="AAPL", min_pct=0.5, partial="true")["gaps"]
    assert {g["kind"] for g in full_only} == {"full"}
    assert {g["kind"] for g in with_partial} == {"full", "partial"}
    assert [g for g in with_partial if g["kind"] == "full"] == full_only
    assert all(g["size_pct"] >= 0.5 for g in with_partial)
    big = gaps(e2e_client, symbol="AAPL", min_pct=3)["gaps"]
    assert len(big) < len(full_only)


def test_gap_fields(e2e_client: TestClient) -> None:
    for g in gaps(e2e_client, symbol="MSFT", min_pct=0, partial="true")["gaps"]:
        assert g["bottom"] < g["top"]
        assert g["direction"] in {"up", "down"}
        if g["filled_time"] is not None:
            # A partial gap can be filled by its own bar (it overlaps the previous one).
            assert g["filled_time"] > g["time"] or (
                g["kind"] == "partial" and g["filled_time"] == g["time"]
            )
            assert g["fill_price"] == (g["bottom"] if g["direction"] == "up" else g["top"])


def test_intraday_times_are_epoch_seconds(e2e_client: TestClient) -> None:
    body = gaps(e2e_client, symbol="AAPL", interval="1h", min_pct=0, partial="true")
    assert body["interval"] == "1h"
    assert body["gaps"]
    assert all(isinstance(g["time"], int) for g in body["gaps"])


def test_weekly_gaps_use_week_dates(e2e_client: TestClient) -> None:
    weekly = gaps(e2e_client, symbol="NVDA", interval="1W", min_pct=0)["gaps"]
    bars = e2e_client.get("/api/bars", params={"symbol": "NVDA", "interval": "1W", "limit": 50000})
    week_starts = {b["time"] for b in bars.json()["bars"]}
    assert weekly
    assert {g["time"] for g in weekly} <= week_starts


def test_small_fixture_without_gaps(client: TestClient) -> None:
    assert gaps(client, symbol="AAA", partial="true") == {
        "symbol": "AAA",
        "interval": "1D",
        "gaps": [],
    }


def test_errors_are_problem_json(client: TestClient) -> None:
    missing = client.get("/api/analysis/gaps", params={"symbol": "NOPE"})
    assert missing.status_code == 404
    assert missing.headers["content-type"].startswith("application/problem+json")
    assert missing.json()["code"] == "symbol_not_found"
    too_big = client.get("/api/analysis/gaps", params={"symbol": "AAA", "min_pct": 51})
    assert too_big.status_code == 422
    assert too_big.headers["content-type"].startswith("application/problem+json")
