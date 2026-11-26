"""Macro series: the BoI parser and source, the fixture round trip, the cache and the service."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import httpx2
import numpy as np
import pytest

from app.data.providers.base import ProviderError, RateLimitedError
from app.data.ratelimit import TokenBucket
from app.errors import DataUnavailableError, SeriesNotFoundError
from app.macro.boi import BoiSource, parse_boi_csv, period_day
from app.macro.fixtures import MacroFixtureSource, read_macro_fixture, write_macro_fixture
from app.macro.series import SERIES, MacroSeries, SeriesSpec
from app.macro.service import MacroCache, MacroService

FIXTURES = Path(__file__).parents[2] / "fixtures"
NO_WAIT = TokenBucket(rate=1e9, capacity=1e9)


def day(text: str) -> int:
    return period_day(text)


# ---------------------------------------------------------------- the BoI parser and source


def test_recorded_boi_answer_parses_to_known_values() -> None:
    series = parse_boi_csv((FIXTURES / "boi_usd_ils_recorded.csv").read_text("utf-8"))
    assert series.days[-1] == day("2026-11-25")
    assert series.values[-1] == 3.38
    assert np.all(np.diff(series.days) > 0)


def test_parser_skips_empty_values_keeps_the_last_duplicate_and_dates_months() -> None:
    text = (
        "﻿SERIES_CODE,TIME_PERIOD,OBS_VALUE\n"
        "X,2026-02,2.0\n"
        "X,2026-01,1.0\n"
        "X,2026-03,\n"
        "X,2026-02,2.5\n"
    )
    series = parse_boi_csv(text)
    assert series.days.tolist() == [day("2026-01-01"), day("2026-02-01")]
    assert series.values.tolist() == [1.0, 2.5]
    assert len(parse_boi_csv("SERIES_CODE,TIME_PERIOD,OBS_VALUE\n")) == 0


def boi_with(handler: Callable[[httpx2.Request], httpx2.Response]) -> BoiSource:
    client = httpx2.Client(base_url="https://boi.test", transport=httpx2.MockTransport(handler))
    return BoiSource(client=client, bucket=NO_WAIT)


def test_boi_source_asks_for_the_whole_series_as_csv() -> None:
    seen: list[httpx2.Request] = []
    recorded = (FIXTURES / "boi_usd_ils_recorded.csv").read_text("utf-8")

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(200, text=recorded)

    series = boi_with(handler).fetch(SERIES["usd_ils_boi"])
    assert seen[0].url.path == "/EXR/1.0/RER_USD_ILS"
    assert seen[0].url.params["format"] == "csv"
    assert seen[0].url.params["startperiod"] == "1950-01-01"
    assert series.values[-1] == 3.38


@pytest.mark.parametrize(
    ("status", "error"), [(429, RateLimitedError), (500, ProviderError), (200, ProviderError)]
)
def test_boi_source_errors(status: int, error: type[Exception]) -> None:
    body = "SERIES_CODE,TIME_PERIOD,OBS_VALUE\n"  # a 200 with no values is an error too
    source = boi_with(lambda _r: httpx2.Response(status, text=body))
    with pytest.raises(error):
        source.fetch(SERIES["cpi"])


def test_every_series_has_a_committed_offline_snapshot() -> None:
    root = Path(__file__).parents[3] / "fixtures" / "macro"
    for spec in SERIES.values():
        series = read_macro_fixture(root / f"{spec.id}.csv")
        assert len(series) > 100, spec.id
        assert np.all(np.diff(series.days) > 0), spec.id
        assert np.all(np.isfinite(series.values)), spec.id


def test_fixture_round_trip_is_exact(tmp_path: Path) -> None:
    series = MacroSeries(np.array([1, 31, 59], dtype=np.int64), np.array([0.1, 2 / 3, 1e-6]))
    write_macro_fixture(tmp_path / "x.csv", series)
    back = read_macro_fixture(tmp_path / "x.csv")
    assert back.days.tolist() == series.days.tolist()
    assert back.values.tolist() == series.values.tolist()


# ---------------------------------------------------------------- the service


class FakeSource:
    def __init__(self, source_id: str, series: MacroSeries | None = None) -> None:
        self.id = source_id
        self.series = series
        self.fail: Exception | None = None
        self.calls = 0

    def fetch(self, spec: SeriesSpec) -> MacroSeries:
        self.calls += 1
        if self.fail is not None:
            raise self.fail
        assert self.series is not None
        return self.series


class Clock:
    now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


CPI = MacroSeries(np.array([day("2026-09-01"), day("2026-10-01")]), np.array([104.9, 105.2]))


def make(tmp_path: Path, *sources: FakeSource) -> tuple[MacroService, Clock]:
    clock = Clock()
    service = MacroService(
        MacroCache(tmp_path / "bars.db"), sources, clock=clock, retry_sleep=lambda _s: None
    )
    return service, clock


def test_served_from_the_cache_until_the_ttl_then_downloaded_whole_again(tmp_path: Path) -> None:
    source = FakeSource("boi", CPI)
    service, clock = make(tmp_path, source)
    first = service.get("cpi")
    assert (first.source, first.stale, source.calls) == ("boi", False, 1)
    assert first.data.values.tolist() == [104.9, 105.2]
    clock.now += 3600
    service.get("cpi")
    assert source.calls == 1
    clock.now += 6 * 3600
    source.series = MacroSeries(CPI.days[:1], np.array([104.8]))  # a BoI revision
    assert service.get("cpi").data.values.tolist() == [104.8]
    assert source.calls == 2


def test_falls_back_to_the_next_source_and_serves_stale_when_all_fail(tmp_path: Path) -> None:
    broken, good = FakeSource("boi"), FakeSource("fixtures", CPI)
    broken.fail = ProviderError("down")
    service, clock = make(tmp_path, broken, good)
    assert service.get("cpi").source == "fixtures"
    good.fail = RateLimitedError("slow down")
    clock.now += 7 * 3600
    stale = service.get("cpi")
    assert stale.stale
    assert stale.data.values.tolist() == [104.9, 105.2]
    assert "refresh failed" in stale.warnings[0]
    assert good.calls == 1 + 3  # the rate-limited source was retried with backoff


def test_unknown_series_and_no_data(tmp_path: Path) -> None:
    broken = FakeSource("boi")
    broken.fail = ProviderError("down")
    service, _ = make(tmp_path, broken)
    with pytest.raises(SeriesNotFoundError):
        service.get("gdp")
    with pytest.raises(DataUnavailableError, match="cpi"):
        service.get("cpi")


def test_fixture_source_reads_the_snapshot(tmp_path: Path) -> None:
    source = MacroFixtureSource(FIXTURES)
    assert source.fetch(SERIES["cpi"]).values.tolist() == [104.6, 104.9, 105.2]
    with pytest.raises(ProviderError, match="boi_rate"):
        source.fetch(SERIES["boi_rate"])
