from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.indicators.catalog import CATALOG


@pytest.mark.parametrize("slug", sorted({spec.learn_slug for spec in CATALOG.values()}))
def test_serves_every_registered_learn_page(client: TestClient, slug: str) -> None:
    response = client.get(f"/api/learn/{slug}")
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == slug
    assert body["markdown"].startswith("# ")


@pytest.mark.parametrize("slug", ["nope", "README", "..%2F..%2Fpyproject"])
def test_unregistered_slugs_are_not_found(client: TestClient, slug: str) -> None:
    response = client.get(f"/api/learn/{slug}")
    assert response.status_code == 404
