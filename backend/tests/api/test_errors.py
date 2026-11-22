from __future__ import annotations

from fastapi import FastAPI, Query
from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import PROBLEM_JSON, ChartLabError
from app.main import create_app


class _TeapotError(ChartLabError):
    status = 418
    code = "teapot"


def _app_with_probe_routes(settings: Settings) -> FastAPI:
    app = create_app(settings)

    @app.get("/api/_probe/domain")
    def domain_error() -> None:
        raise _TeapotError("short and stout")

    @app.get("/api/_probe/boom")
    def unexpected_error() -> None:
        raise RuntimeError("kaboom")

    @app.get("/api/_probe/validate")
    def validated(n: int = Query(ge=1)) -> int:
        return n

    return app


def test_unknown_route_returns_problem_json(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 404
    assert body["title"] == "Not Found"
    assert body["code"] == "not_found"
    assert body["instance"] == "/api/does-not-exist"


def test_domain_error_maps_status_and_code(settings: Settings) -> None:
    with TestClient(_app_with_probe_routes(settings)) as client:
        response = client.get("/api/_probe/domain")

    assert response.status_code == 418
    assert response.json()["code"] == "teapot"
    assert response.json()["detail"] == "short and stout"


def test_validation_error_lists_fields(settings: Settings) -> None:
    with TestClient(_app_with_probe_routes(settings)) as client:
        response = client.get("/api/_probe/validate", params={"n": 0})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["errors"][0]["loc"] == ["query", "n"]


def test_unexpected_error_hides_details_and_returns_correlation_id(settings: Settings) -> None:
    with TestClient(_app_with_probe_routes(settings), raise_server_exceptions=False) as client:
        response = client.get("/api/_probe/boom")

    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "internal_error"
    assert "kaboom" not in body["detail"]
    assert len(body["correlation_id"]) == 32
