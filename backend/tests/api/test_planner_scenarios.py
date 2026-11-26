"""``/api/planner/scenarios``: named planner scenarios, saved whole and read back as they were."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

STATE: dict[str, Any] = {
    "version": 1,
    "market": {"a": {"assets": [{"symbol": "SPY", "weight": 100}]}, "b": {"assets": []}},
    "home": {"a": {"price": 2_000_000, "tracks": [{"years": 25, "rate": 4.6}]}, "b": None},
    "contents": {"a": {"home": True, "deposits": False}},
    "note": "₪ and “quotes” survive",
}
URL = "/api/planner/scenarios"


def put(client: TestClient, name: str, revision: int, state: Any = STATE) -> Any:
    return client.put(f"{URL}/{name}", json={"revision": revision, "state": state})


def test_round_trip_with_revisions(client: TestClient) -> None:
    assert client.get(URL).json() == {"scenarios": []}
    saved = put(client, "Two rooms in Haifa", 0)
    assert saved.status_code == 200, saved.text
    doc = saved.json()
    assert (doc["name"], doc["revision"], doc["state"]) == ("Two rooms in Haifa", 1, STATE)
    assert client.get(f"{URL}/Two%20rooms%20in%20Haifa").json() == doc
    second = put(client, "Two rooms in Haifa", 1, {**STATE, "version": 2}).json()
    assert (second["revision"], second["state"]["version"]) == (2, 2)
    put(client, "Another", 0)
    listed = client.get(URL).json()["scenarios"]
    assert {(s["name"], s["revision"]) for s in listed} == {
        ("Two rooms in Haifa", 2),
        ("Another", 1),
    }
    assert all(set(s) == {"name", "revision", "updated_at"} for s in listed)  # no state in a list


def test_a_stale_revision_is_a_conflict_and_a_missing_one_is_not_found(client: TestClient) -> None:
    put(client, "A", 0)
    stale = put(client, "A", 0)
    assert (stale.status_code, stale.json()["code"]) == (409, "revision_conflict")
    missing = client.get(f"{URL}/Nope")
    assert (missing.status_code, missing.json()["code"]) == (404, "scenario_not_found")


def test_delete(client: TestClient) -> None:
    gone = client.delete(f"{URL}/A", params={"revision": 1})
    assert (gone.status_code, gone.json()["code"]) == (404, "scenario_not_found")
    put(client, "A", 0)
    assert client.delete(f"{URL}/A", params={"revision": 2}).status_code == 409
    assert client.delete(f"{URL}/A", params={"revision": 1}).status_code == 204
    assert client.get(f"{URL}/A").status_code == 404
    assert client.get(URL).json() == {"scenarios": []}


def test_what_is_not_a_scenario_is_refused(client: TestClient) -> None:
    assert put(client, "A", 0, [1, 2]).status_code == 422  # the state is an object
    assert put(client, "A", 0, {}).status_code == 422  # and not an empty one
    assert put(client, "x" * 61, 0).status_code == 422
    assert put(client, "%20", 0).status_code == 422
    assert client.put(f"{URL}/A", json={"state": STATE}).status_code == 422  # no revision
    huge = put(client, "A", 0, {"blob": "x" * 300_000})
    assert huge.status_code == 422
    assert "too large" in huge.text
    assert client.get(URL).json() == {"scenarios": []}
