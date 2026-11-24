"""Shared API test fixtures."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import IsolatedSettings

#: The Playwright universe: synthetic data with thousands of daily bars per symbol.
E2E_DATA = Path(__file__).resolve().parents[3] / "frontend" / "e2e" / "data"


@pytest.fixture
def e2e_client(tmp_path: Path) -> Iterator[TestClient]:
    """The synthetic e2e universe (thousands of daily bars per symbol), offline."""
    settings = IsolatedSettings(
        offline=True,
        chartlab_data_dir=tmp_path / "data",
        universe_file=E2E_DATA / "universe.toml",
        fixtures_dir=E2E_DATA,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
