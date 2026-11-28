"""Shared API test fixtures."""

from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import IsolatedSettings

#: The Playwright universe: synthetic data with thousands of daily bars per symbol.
REPO_STRATEGIES = Path(__file__).resolve().parents[3] / "strategies"

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


@pytest.fixture
def api(tmp_path: Path) -> Iterator[TestClient]:
    """The e2e universe (long synthetic histories) with a strategies folder of its own."""
    folder = tmp_path / "strategies"
    folder.mkdir()
    shutil.copy(REPO_STRATEGIES / "breakout_weekly_trend.py", folder)
    (folder / "cheat.py").write_text(
        "import numpy as np\n"
        "def signals(bars, params, ind):\n"
        "    return {'long_entry': np.roll(bars.close, -1) > bars.close}\n",
        encoding="utf-8",
    )
    (folder / "broken.py").write_text("def signals(:\n", encoding="utf-8")
    settings = IsolatedSettings(
        offline=True,
        chartlab_data_dir=tmp_path / "data",
        universe_file=E2E_DATA / "universe.toml",
        fixtures_dir=E2E_DATA,
        strategies_dir=folder,
    )
    with TestClient(create_app(settings)) as client:
        yield client
