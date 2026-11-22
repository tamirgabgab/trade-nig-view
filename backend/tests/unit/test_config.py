from __future__ import annotations

import pytest

from tests.conftest import IsolatedSettings


def test_cors_origins_accept_comma_separated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHARTLAB_CORS_ORIGINS", "http://localhost:5173, http://127.0.0.1:5173")

    settings = IsolatedSettings()

    assert settings.chartlab_cors_origins == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_offline_flag_parses_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OFFLINE", "1")

    assert IsolatedSettings().offline is True
