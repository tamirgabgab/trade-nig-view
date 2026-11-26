"""``/api/macro``: the series list and one series, offline (test fixtures)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.macro.series import SERIES


def test_lists_every_series(client: TestClient) -> None:
    body = client.get("/api/macro/series").json()
    assert [s["id"] for s in body] == list(SERIES)
    dwelling = next(s for s in body if s["id"] == "dwelling")
    assert dwelling["source_series"] == "REAL_ES_DF/IND_FLT_M"
    assert dwelling["frequency"] == "monthly"


def test_one_series_with_an_inclusive_date_window(client: TestClient) -> None:
    body = client.get("/api/macro/series/cpi").json()
    assert (body["source"], body["stale"], body["unit"]) == ("fixtures", False, "index")
    assert body["points"] == [
        {"date": "2026-08-01", "value": 104.6},
        {"date": "2026-09-01", "value": 104.9},
        {"date": "2026-10-01", "value": 105.2},
    ]
    window = client.get(
        "/api/macro/series/cpi", params={"start": "2026-09-01", "end": "2026-09-30"}
    )
    assert [p["date"] for p in window.json()["points"]] == ["2026-09-01"]


def test_errors_are_problem_json(client: TestClient) -> None:
    missing = client.get("/api/macro/series/gdp")
    assert (missing.status_code, missing.json()["code"]) == (404, "series_not_found")
    no_data = client.get("/api/macro/series/boi_rate")  # no test fixture
    assert (no_data.status_code, no_data.json()["code"]) == (503, "data_unavailable")
