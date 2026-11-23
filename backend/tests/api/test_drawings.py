from __future__ import annotations

from fastapi.testclient import TestClient

POINTS = [{"time": 1_700_000_000, "price": 100.0}, {"time": 1_700_604_800, "price": 110.0}]
LINE: dict[str, object] = {
    "id": "d1",
    "type": "trend_line",
    "points": POINTS,
    "style": {"line_color": "#FF9800", "line_width": 2, "line_style": "dashed"},
}


def test_round_trip_with_revisions(client: TestClient) -> None:
    empty = client.get("/api/drawings/AAA").json()
    assert empty == {"schema_version": 1, "symbol": "AAA", "revision": 0, "drawings": []}

    saved = client.put("/api/drawings/AAA", json={"revision": 0, "drawings": [LINE]})
    assert saved.status_code == 200
    assert saved.json()["revision"] == 1

    again = client.get("/api/drawings/AAA").json()
    assert again["drawings"][0]["style"]["line_style"] == "dashed"
    assert again["drawings"][0]["points"][1]["price"] == 110.0


def test_stale_revision_is_a_409_problem(client: TestClient) -> None:
    client.put("/api/drawings/AAA", json={"revision": 0, "drawings": [LINE]})
    response = client.put("/api/drawings/AAA", json={"revision": 0, "drawings": []})
    assert response.status_code == 409
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "revision_conflict"


def test_invalid_drawings_and_unknown_symbols(client: TestClient) -> None:
    bad = {**LINE, "points": POINTS[:1]}
    assert (
        client.put("/api/drawings/AAA", json={"revision": 0, "drawings": [bad]}).status_code == 422
    )
    assert client.get("/api/drawings/NOPE").status_code == 404
