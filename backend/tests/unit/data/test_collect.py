"""The daily intraday collector (``python -m app.data.collect``), on fixture providers."""

from __future__ import annotations

import shutil
import time
from pathlib import Path

import pytest

from app.config import Settings
from app.data import collect
from app.data.providers.base import DataProvider
from app.data.providers.fixtures import (
    FixtureProvider,
    read_intraday_fixture,
    write_intraday_fixture,
)
from app.models.bars import BarFrame

TESTS = Path(__file__).parents[2]


def settings(tmp_path: Path, *, offline: bool = False) -> Settings:
    return Settings(
        offline=offline,
        chartlab_data_dir=tmp_path / "data",
        universe_file=TESTS / "fixtures" / "universe.toml",
    )


def test_collects_each_base_of_every_watchlist_symbol(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    fixtures = tmp_path / "fixtures"
    shutil.copytree(TESTS / "fixtures" / "daily", fixtures / "daily")
    shutil.copytree(TESTS / "fixtures" / "1h", fixtures / "1h")
    # Any bars will do as 5m ones, moved by whole weeks into Yahoo's last 60 days.
    hourly = read_intraday_fixture(fixtures / "1h" / "AAA.csv")
    week = 7 * 86_400
    shift = (int(time.time()) - int(hourly.time[-1])) // week * week
    recent = BarFrame(
        hourly.time + shift, hourly.open, hourly.high, hourly.low, hourly.close,
        hourly.adj_close, hourly.volume,
    )  # fmt: skip
    write_intraday_fixture(fixtures / "5m" / "AAA.csv", recent)

    def providers(_settings: Settings) -> list[DataProvider]:
        return [FixtureProvider(fixtures)]

    monkeypatch.setattr(collect, "get_settings", lambda: settings(tmp_path))
    monkeypatch.setattr(collect, "build_providers", providers)

    assert collect.main() == 1  # AAA has no 1m bars, IDX no intraday, BBB nothing
    out = capsys.readouterr().out
    assert "OK   AAA        5m " in out
    assert "OK   AAA        1h " in out
    assert "FAIL AAA        1m " in out
    assert "3 symbols" in out


def test_offline_has_nothing_to_collect(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(collect, "get_settings", lambda: settings(tmp_path, offline=True))
    assert collect.main() == 1
