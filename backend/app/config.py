"""Application settings, loaded from environment variables and the repo-root ``.env`` file."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration. Field names map to upper-case env vars (``OFFLINE``, ...)."""

    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    offline: bool = False
    chartlab_data_dir: Path = REPO_ROOT / "data"
    # NoDecode: the env value is a comma-separated string, not JSON.
    chartlab_cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )
    log_level: str = "INFO"

    # Market data
    data_providers: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["yahoo", "tiingo"]
    )
    tiingo_api_key: SecretStr | None = None
    universe_file: Path = REPO_ROOT / "backend" / "config" / "universe.toml"
    fixtures_dir: Path = REPO_ROOT / "backend" / "fixtures"  # daily/, 1h/ (5m/, 1m/) inside
    refresh_ttl_s: float = 900.0
    macro_ttl_s: float = 6 * 3600.0  # Bank of Israel series: daily or monthly
    learn_dir: Path = REPO_ROOT / "docs" / "indicators"  # learn pages, <learn_slug>.md
    strategies_dir: Path = REPO_ROOT / "strategies"  # the user's Python strategies, <name>.py

    @field_validator("tiingo_api_key", mode="before")
    @classmethod
    def _empty_key_is_none(cls, value: object) -> object:
        """``TIINGO_API_KEY=`` (empty, as in .env.example) means "no key"."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("chartlab_cors_origins", "data_providers", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Accept a comma-separated string (as written in ``.env``) as well as a list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance (cached)."""
    return Settings()
