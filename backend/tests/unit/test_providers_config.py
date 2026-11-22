from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import SecretStr

from app.main import build_providers
from tests.conftest import IsolatedSettings


def test_offline_uses_fixtures_only(tmp_path: Path) -> None:
    providers = build_providers(IsolatedSettings(offline=True, fixtures_dir=tmp_path))
    assert [p.id for p in providers] == ["fixtures"]


def test_online_chain_follows_settings_and_skips_unknown_ids() -> None:
    settings = IsolatedSettings(
        data_providers=["yahoo", "tiingo", "twelvedata"], tiingo_api_key="k"
    )
    assert [p.id for p in build_providers(settings)] == ["yahoo", "tiingo"]


@pytest.mark.parametrize("key", ["", "   "])
def test_tiingo_is_disabled_without_a_key(monkeypatch: pytest.MonkeyPatch, key: str) -> None:
    monkeypatch.setenv("TIINGO_API_KEY", key)  # as written by .env.example: "TIINGO_API_KEY="
    settings = IsolatedSettings(data_providers=["yahoo", "tiingo"])
    assert settings.tiingo_api_key is None
    assert [p.id for p in build_providers(settings)] == ["yahoo"]


def test_data_providers_parse_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATA_PROVIDERS", "tiingo, yahoo")
    assert IsolatedSettings().data_providers == ["tiingo", "yahoo"]
