from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

DEFAULT_SECTIONS = [
    {"title": "Stocks", "symbols": ["AAA"]},
    {"title": "Indices", "symbols": ["^IDX"]},
    {"title": "ETFs", "symbols": ["BBB"]},
]


def put(client: TestClient, name: str, revision: int, sections: list[dict[str, Any]]) -> Any:
    return client.put(f"/api/watchlists/{name}", json={"revision": revision, "sections": sections})


def test_default_is_synthesized_until_the_first_save(client: TestClient) -> None:
    assert client.get("/api/watchlists").json() == {
        "watchlists": [
            {
                "schema_version": 1,
                "name": "Default",
                "revision": 0,
                "updated_at": "",
                "sections": DEFAULT_SECTIONS,
            }
        ]
    }
    saved = put(client, "Swing", 0, [{"title": "Mine", "symbols": ["idx", "aaa"]}])
    assert saved.status_code == 200
    doc = saved.json()
    assert (doc["name"], doc["revision"]) == ("Swing", 1)
    assert doc["sections"] == [{"title": "Mine", "symbols": ["^IDX", "AAA"]}]
    assert client.get("/api/watchlists").json() == {"watchlists": [doc]}


def test_saving_the_default_bumps_it(client: TestClient) -> None:
    first = put(client, "Default", 0, DEFAULT_SECTIONS).json()
    second = put(client, "Default", 1, DEFAULT_SECTIONS[:1]).json()
    assert (first["revision"], second["revision"]) == (1, 2)
    assert client.get("/api/watchlists").json()["watchlists"] == [second]


def test_stale_revision_is_a_409_problem(client: TestClient) -> None:
    put(client, "W", 0, DEFAULT_SECTIONS)
    response = put(client, "W", 0, DEFAULT_SECTIONS)
    assert response.status_code == 409
    assert response.json()["code"] == "revision_conflict"


def test_delete_brings_the_default_back(client: TestClient) -> None:
    missing = client.delete("/api/watchlists/W", params={"revision": 1})
    assert (missing.status_code, missing.json()["code"]) == (404, "watchlist_not_found")
    put(client, "W", 0, DEFAULT_SECTIONS)
    assert client.delete("/api/watchlists/W", params={"revision": 3}).status_code == 409
    assert client.delete("/api/watchlists/W", params={"revision": 1}).status_code == 204
    assert client.get("/api/watchlists").json()["watchlists"][0]["name"] == "Default"


INVALID: list[tuple[list[dict[str, Any]], str]] = [
    ([{"title": "A", "symbols": ["NOPE"]}], "invalid_watchlist"),
    (
        [{"title": "A", "symbols": ["AAA"]}, {"title": "B", "symbols": ["aaa"]}],
        "invalid_watchlist",
    ),
    ([{"title": "A", "symbols": ["^IDX", "IDX"]}], "invalid_watchlist"),
    ([{"title": "", "symbols": []}], "validation_error"),
    ([{"title": "A", "symbols": [], "x": 1}], "validation_error"),
    ([{"title": f"S{i}", "symbols": []} for i in range(31)], "validation_error"),
]


@pytest.mark.parametrize(("sections", "code"), INVALID)
def test_invalid_watchlists_are_422(
    client: TestClient, sections: list[dict[str, Any]], code: str
) -> None:
    response = put(client, "W", 0, sections)
    assert response.status_code == 422
    assert response.json()["code"] == code


def test_bad_name_is_422(client: TestClient) -> None:
    assert put(client, "a%7Fb", 0, DEFAULT_SECTIONS).status_code == 422


def test_a_new_list_can_be_empty(client: TestClient) -> None:
    response = client.put("/api/watchlists/Tech", json={"revision": 0, "sections": []})
    assert response.status_code == 200
    assert response.json()["sections"] == []
