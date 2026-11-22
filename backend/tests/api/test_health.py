from __future__ import annotations

from fastapi.testclient import TestClient

from app import __version__


def test_health_reports_ok_and_version(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": __version__,
        "offline": True,
        "providers": [{"id": "fixtures", "enabled": True}],
    }


def test_openapi_schema_is_served_under_api_prefix(client: TestClient) -> None:
    response = client.get("/api/openapi.json")

    assert response.status_code == 200
    assert "/api/health" in response.json()["paths"]
