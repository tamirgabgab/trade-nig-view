from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError

from app.models.layouts import DocumentName

BB: dict[str, Any] = {
    "uid": "i1",
    "id": "bb",
    "params": {"length": 30.0},
    "styles": {"basis": {"color": "#FF9800", "line_width": 2}},
}
LAYOUT: dict[str, Any] = {
    "symbol": "idx",
    "interval": "1D",
    "chart_type": "candles",
    "scale_mode": "log",
    "indicators": [BB, {"uid": "i2", "id": "rsi", "visible": False, "pane_stretch": 25}],
    "visible_range": {"from": "2026-01-02", "to": "2026-03-31"},
}


def put(client: TestClient, name: str, revision: int, **changes: Any) -> Any:
    return client.put(f"/api/layouts/{name}", json={**LAYOUT, "revision": revision, **changes})


def test_round_trip_with_revisions(client: TestClient) -> None:
    assert client.get("/api/layouts").json() == {"layouts": []}

    saved = put(client, "My setup", 0)
    assert saved.status_code == 200
    doc = saved.json()
    assert (doc["name"], doc["revision"], doc["schema_version"]) == ("My setup", 1, 1)
    assert doc["symbol"] == "^IDX"  # canonical
    assert doc["indicators"][0]["params"] == {"length": 30}  # coerced to the param's type
    assert doc["visible_range"] == {"from": "2026-01-02", "to": "2026-03-31"}
    assert (doc["auto_scale"], doc["adjusted"]) == (True, True)
    assert doc["compare"] == []

    again = client.get("/api/layouts/My%20setup").json()
    assert again == doc

    second = put(client, "My setup", 1, interval="1h").json()
    assert (second["revision"], second["interval"]) == (2, "1h")
    summary = client.get("/api/layouts").json()["layouts"]
    assert summary == [
        {
            "name": "My setup",
            "revision": 2,
            "updated_at": second["updated_at"],
            "symbol": "^IDX",
            "interval": "1h",
        }
    ]


def test_stale_revision_is_a_409_problem(client: TestClient) -> None:
    put(client, "A", 0)
    response = put(client, "A", 0)
    assert response.status_code == 409
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "revision_conflict"


def test_missing_layout_is_a_404(client: TestClient) -> None:
    response = client.get("/api/layouts/Nope")
    assert response.status_code == 404
    assert response.json()["code"] == "layout_not_found"


def test_delete(client: TestClient) -> None:
    assert client.delete("/api/layouts/A", params={"revision": 1}).json()["code"] == (
        "layout_not_found"
    )
    put(client, "A", 0)
    assert client.delete("/api/layouts/A", params={"revision": 2}).status_code == 409
    response = client.delete("/api/layouts/A", params={"revision": 1})
    assert response.status_code == 204
    assert client.get("/api/layouts/A").status_code == 404


@pytest.mark.parametrize(
    ("changes", "code"),
    [
        ({"symbol": "NOPE"}, "invalid_layout"),
        ({"indicators": [{**BB, "id": "nope"}]}, "invalid_layout"),
        ({"indicators": [{**BB, "params": {"length": 0}}]}, "invalid_params"),
        ({"indicators": [{**BB, "params": {"nope": 1}}]}, "invalid_params"),
        (
            {"indicators": [{**BB, "styles": {"nope": {"color": "#000000", "line_width": 1}}}]},
            "invalid_layout",
        ),
        ({"indicators": [BB, BB]}, "validation_error"),
        (
            {"indicators": [{**BB, "styles": {"basis": {"color": "red", "line_width": 1}}}]},
            "validation_error",
        ),
        ({"indicators": [{**BB, "pane_stretch": 0}]}, "validation_error"),
        ({"chart_type": "renko"}, "validation_error"),
        ({"interval": "5m"}, "validation_error"),
        ({"extra": 1}, "validation_error"),
        ({"compare": ["a", "b", "c", "d"]}, "validation_error"),
    ],
)
def test_invalid_layouts_are_422(client: TestClient, changes: dict[str, Any], code: str) -> None:
    response = put(client, "A", 0, **changes)
    assert response.status_code == 422
    assert response.json()["code"] == code
    assert client.get("/api/layouts").json() == {"layouts": []}


@pytest.mark.parametrize("name", ["%20%20", "a%01b", "x" * 61])
def test_bad_names_are_422(client: TestClient, name: str) -> None:
    assert put(client, name, 0).status_code == 422


def test_names_are_stripped(client: TestClient) -> None:
    assert put(client, "%20Main%20", 0).json()["name"] == "Main"
    assert client.get("/api/layouts/Main").status_code == 200


@pytest.mark.parametrize("name", [".", "..", " ... "])
def test_names_of_only_dots_are_refused(name: str) -> None:
    # A URL path cannot carry them (the browser collapses "." and ".."), so test the type itself.
    with pytest.raises(ValidationError, match="only dots"):
        TypeAdapter(DocumentName).validate_python(name)


def test_compare_symbols_are_canonical_unique_and_not_the_chart(client: TestClient) -> None:
    doc = put(client, "C", 0, compare=["idx", "^IDX"]).json()
    assert doc["compare"] == []  # the chart's own symbol, once canonical, is dropped
    universe = client.get("/api/symbols").json()
    others = [s["symbol"] for s in universe if s["symbol"] != "^IDX"][:2]
    doc = put(client, "C", 1, compare=[others[0], "gone", others[1]]).json()
    assert doc["compare"] == others  # a symbol not in the universe is dropped
    doc = put(client, "C", 2, compare=[others[0], others[0]]).json()
    assert doc["compare"] == others[:1]
