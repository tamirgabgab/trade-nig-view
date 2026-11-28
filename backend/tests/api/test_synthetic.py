"""``/api/synthetic``: definitions, their bars through every API, references and the delete
cascade (Phase K, K0)."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any, cast

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.synthetic import daily_bars
from app.data.universe import Universe
from app.main import close_stores, create_app
from app.models.bars import date_to_ts
from app.models.synthetic import MAX_DEFINITIONS, ScenarioDefinition
from app.planner.data import AssetRequest, asset_info
from app.planner.market import PlanError

URL = "/api/synthetic"
WALK: dict[str, Any] = {
    "kind": "scenario",
    "name": "walk1",
    "full_name": "Random walk, seed 7",
    "scenario": "random_walk",
    "seed": 7,
    "first_date": "2015-01-02",
    "first_price": 50.0,
    "bars": 1000,
}
SYMBOL = "SYN:WALK1"


def put(client: TestClient, revision: int = 0, symbol: str = SYMBOL, **changes: Any) -> Any:
    body = {"revision": revision, "definition": {**WALK, **changes}}
    return client.put(f"{URL}/{symbol}", json=body)


def bars(client: TestClient, interval: str = "1D", **params: Any) -> Any:
    query = {"symbol": SYMBOL, "interval": interval, "limit": 50_000, **params}
    return client.get("/api/bars", params=query)


def test_create_read_list_and_search(client: TestClient) -> None:
    created = put(client)
    assert created.status_code == 200
    doc = created.json()
    assert (doc["symbol"], doc["revision"]) == (SYMBOL, 1)
    assert doc["definition"]["name"] == "WALK1"  # upper-cased
    assert doc["definition"]["currency"] == "ILS"
    assert doc["last_date"] == "2018-11-01"  # the 1000th weekday
    assert client.get(f"{URL}/syn:walk1").json() == doc
    assert client.get(URL).json() == [doc]

    found = client.get("/api/symbols", params={"query": "walk"}).json()
    assert [s["symbol"] for s in found] == [SYMBOL]
    info = found[0]
    assert (info["type"], info["group"], info["exchange"], info["name"]) == (
        "synthetic",
        "Synthetic",
        "Synthetic",
        "Random walk, seed 7",
    )
    assert [s["symbol"] for s in client.get("/api/symbols").json()][-1] == SYMBOL


def test_the_default_watchlist_does_not_list_it(client: TestClient) -> None:
    put(client)
    default = client.get("/api/watchlists").json()["watchlists"][0]
    assert all(SYMBOL not in section["symbols"] for section in default["sections"])


def test_daily_bars_are_the_definitions(client: TestClient) -> None:
    put(client)
    body = bars(client).json()
    assert (body["source"], body["stale"], body["provider_window_days"]) == (
        "synthetic",
        False,
        None,
    )
    assert body["timezone"] == "America/New_York"
    expected = daily_bars(ScenarioDefinition.model_validate(WALK))
    assert len(body["bars"]) == len(expected) == 1000
    np.testing.assert_allclose([b["close"] for b in body["bars"]], expected.close, rtol=1e-12)
    assert body["bars"][0]["time"] == "2015-01-02"


def test_four_hour_and_weekly_bars_aggregate_the_hours_and_days(client: TestClient) -> None:
    put(client, bars=300)
    hours = bars(client, "1h").json()["bars"]
    four = bars(client, "4h").json()["bars"]
    days = bars(client, "1D").json()["bars"]
    assert (len(hours), len(four), len(days)) == (2100, 600, 300)
    # 4h: 09:30-13:30 (four bars) and 13:30-16:00 (three), as for a US stock.
    for k, bar in enumerate(four):
        group = hours[7 * (k // 2) + 4 * (k % 2) : 7 * (k // 2) + (4 if k % 2 == 0 else 7)]
        assert bar["time"] == group[0]["time"]
        assert bar["open"] == group[0]["open"]
        assert bar["close"] == group[-1]["close"]
        assert bar["high"] == max(b["high"] for b in group)
        assert bar["low"] == min(b["low"] for b in group)
    weekly = bars(client, "1W").json()["bars"]
    assert weekly[0]["open"] == days[0]["open"]
    assert bars(client, "1M").status_code == 200


def test_replay_sees_only_bars_up_to_the_cursor(client: TestClient) -> None:
    put(client, scenario="regimes", bars=400)
    for interval in ("1h", "4h", "1D", "1W", "1M"):
        full = bars(client, interval).json()["bars"]
        cut = bars(client, interval, until="2016-02-10").json()["bars"]
        assert 0 < len(cut) < len(full)
        if interval in ("1W", "1M"):  # the cursor's week or month is still forming
            assert cut[:-1] == full[: len(cut) - 1]
        else:
            assert cut == full[: len(cut)]


def test_minute_bars_are_a_422(client: TestClient) -> None:
    put(client)
    response = bars(client, "5m")
    assert response.status_code == 422
    assert response.json()["code"] == "interval_unavailable"


def test_quotes_and_indicators_work_on_it(client: TestClient) -> None:
    put(client)
    quote = client.get("/api/quotes", params={"symbols": SYMBOL}).json()[0]
    assert quote["error"] is None
    assert quote["last"] > 0
    computed = client.post(
        "/api/indicators/compute", json={"symbol": SYMBOL, "id": "rsi", "interval": "1h"}
    )
    assert computed.status_code == 200


def test_edit_in_place_changes_the_bars_at_once(client: TestClient) -> None:
    put(client)
    before = bars(client).json()["bars"]
    edited = put(client, revision=1, seed=8)
    assert edited.json()["revision"] == 2
    assert bars(client).json()["bars"] != before
    stale = put(client, revision=1, seed=9)
    assert stale.status_code == 409


def test_a_taken_name_is_a_conflict(client: TestClient) -> None:
    put(client)
    again = put(client, revision=0, full_name="Another")
    assert again.status_code == 409
    assert again.json()["code"] == "revision_conflict"


@pytest.mark.parametrize(
    ("symbol", "changes"),
    [
        ("SYN:1ABC", {"name": "1abc"}),  # starts with a digit
        ("SYN:A B", {"name": "a b"}),
        ("SYN:ABCDEFGHIJKLM", {"name": "abcdefghijklm"}),  # 13 characters
        ("SYN:שלום", {"name": "שלום"}),
        ("SYN:OTHER", {}),  # the path does not match the name
        (SYMBOL, {"first_date": "2100-01-01"}),  # ends after today
        (SYMBOL, {"first_date": "1969-12-31"}),  # bars start in 1970
        (SYMBOL, {"bars": 99}),
        (SYMBOL, {"bars": 10_001}),
        (SYMBOL, {"first_price": 0}),
        (SYMBOL, {"currency": "EUR"}),
        (SYMBOL, {"full_name": "  "}),
        (SYMBOL, {"scenario": "moon"}),
    ],
)
def test_invalid_definitions_are_a_422(
    client: TestClient, symbol: str, changes: dict[str, Any]
) -> None:
    response = put(client, symbol=symbol, **changes)
    assert response.status_code == 422, response.json()


def test_the_last_bar_must_be_before_today(client: TestClient) -> None:
    # 100 bars ending today (or, on a weekend, on the next Monday): today's hours are not over.
    today = np.datetime64(dt.datetime.now(dt.UTC).date(), "D")
    first = str(np.busday_offset(today, -99, roll="forward"))
    response = put(client, first_date=first, bars=100)
    assert response.status_code == 422
    assert "not before today" in response.json()["detail"]


def test_a_timed_planner_deposit_falls_back_to_the_hours(client: TestClient) -> None:
    # A synthetic symbol has no minute bars: the deposit's time is read from the 1h bars.
    put(client, first_date="2025-01-02", bars=300)
    body = {
        "assets": [{"symbol": SYMBOL, "currency": "ILS"}],
        "use_fx": False,
        "deposits": [{"date": "2025-06-10", "amount": 1000, "time": "17:00"}],
        "end": "2025-09-01",
        "taxes": {"gains_pct": 0, "dividend_pct": 0},
    }
    response = client.post("/api/planner/market", json=body)
    assert response.status_code == 200, response.text


def test_names_with_dots_dashes_and_underscores(client: TestClient) -> None:
    assert put(client, symbol="SYN:A.B-C_D", name="a.b-c_d").status_code == 200


def test_at_most_max_definitions(client: TestClient) -> None:
    for k in range(MAX_DEFINITIONS):
        assert put(client, symbol=f"SYN:S{k}", name=f"S{k}", bars=100).status_code == 200
    response = put(client, symbol="SYN:ONEMORE", name="onemore", bars=100)
    assert response.status_code == 422
    assert response.json()["code"] == "too_many_synthetic"
    assert put(client, revision=1, symbol="SYN:S0", name="S0", bars=200).status_code == 200


def test_definitions_survive_a_restart(settings: Settings) -> None:
    first = create_app(settings)
    with TestClient(first) as client:
        put(client)
    close_stores(first)
    with TestClient(create_app(settings)) as client:
        assert client.get(f"{URL}/{SYMBOL}").json()["revision"] == 1
        assert bars(client).status_code == 200


def seed_references(client: TestClient) -> None:
    """A layout charting the symbol, one comparing it, a watchlist, two drawings, a scenario."""
    layout: dict[str, Any] = {
        "symbol": SYMBOL,
        "interval": "1D",
        "chart_type": "candles",
        "scale_mode": "normal",
        "indicators": [],
    }
    assert client.put("/api/layouts/Chart", json={**layout, "revision": 0}).status_code == 200
    compare = {**layout, "symbol": "AAA", "compare": [SYMBOL, "^IDX"]}
    assert client.put("/api/layouts/Both", json={**compare, "revision": 0}).status_code == 200
    sections = [
        {"title": "Mine", "symbols": ["AAA", SYMBOL]},
        {"title": "Other", "symbols": ["^IDX"]},
    ]
    assert (
        client.put("/api/watchlists/W", json={"revision": 0, "sections": sections}).status_code
        == 200
    )
    point = {"time": date_to_ts(ScenarioDefinition.model_validate(WALK).first_date), "price": 50.0}
    drawing: dict[str, Any] = {"type": "horizontal_line", "points": [point], "style": {}}
    two = [{**drawing, "id": "d1"}, {**drawing, "id": "d2"}]
    assert (
        client.put(f"/api/drawings/{SYMBOL}", json={"revision": 0, "drawings": two}).status_code
        == 200
    )
    state = {"version": 3, "market": {"mix": [{"symbol": SYMBOL.lower(), "weight": 1}]}}
    assert (
        client.put("/api/planner/scenarios/Plan", json={"revision": 0, "state": state}).status_code
        == 200
    )


def test_references_list_what_points_at_it(client: TestClient) -> None:
    put(client)
    seed_references(client)
    assert client.get(f"{URL}/{SYMBOL}/references").json() == {
        "layouts": ["Chart"],
        "compared_in": ["Both"],
        "watchlists": ["W"],
        "drawings": 2,
        "scenarios": ["Plan"],
    }
    assert client.get(f"{URL}/SYN:NONE/references").status_code == 404


def test_delete_cleans_watchlists_and_drawings_first(client: TestClient) -> None:
    put(client)
    seed_references(client)
    # A stale revision changes nothing: the drawings and the watchlist entry stay.
    assert client.delete(f"{URL}/{SYMBOL}", params={"revision": 0}).status_code == 409
    refs = client.get(f"{URL}/{SYMBOL}/references").json()
    assert (refs["drawings"], refs["watchlists"]) == (2, ["W"])
    assert client.delete(f"{URL}/{SYMBOL}", params={"revision": 1}).status_code == 204

    assert client.get(f"{URL}/{SYMBOL}").status_code == 404
    assert bars(client).status_code == 404
    watchlist = client.get("/api/watchlists").json()["watchlists"][0]
    assert watchlist["revision"] == 2
    assert watchlist["sections"] == [
        {"title": "Mine", "symbols": ["AAA"]},
        {"title": "Other", "symbols": ["^IDX"]},
    ]
    # Re-created under the same name, it starts without the old drawings.
    put(client)
    assert client.get(f"/api/drawings/{SYMBOL}").json()["drawings"] == []
    # Layouts keep their text (the page opens a missing symbol on the default one).
    assert client.get("/api/layouts/Chart").json()["symbol"] == SYMBOL
    assert client.delete(f"{URL}/SYN:NONE", params={"revision": 1}).status_code == 404


def test_the_planner_names_a_deleted_synthetic_symbol(client: TestClient) -> None:
    universe = cast("Universe", cast("FastAPI", client.app).state.universe)
    put(client)
    assert asset_info(universe, AssetRequest(SYMBOL)).type == "synthetic"
    client.delete(f"{URL}/{SYMBOL}", params={"revision": 1})
    with pytest.raises(PlanError, match="was a synthetic symbol and has been deleted"):
        asset_info(universe, AssetRequest(SYMBOL))


def test_the_test_data_dir_is_released(settings: Settings, tmp_path: Path) -> None:
    app = create_app(settings)
    close_stores(app)  # every store of app.db, the synthetic one included
    assert (tmp_path / "data" / "app.db").exists()


# --- K1: dwelling prices ------------------------------------------------------------------------

HOME: dict[str, Any] = {
    "kind": "dwelling",
    "name": "home",
    "full_name": "Dwelling prices, Israel",
    "seed": 4,
}
HOME_SYMBOL = "SYN:HOME"


def put_home(client: TestClient, revision: int = 0, **changes: Any) -> Any:
    body = {"revision": revision, "definition": {**HOME, **changes}}
    return client.put(f"{URL}/{HOME_SYMBOL}", json=body)


def home_bars(client: TestClient, interval: str = "1D") -> list[dict[str, Any]]:
    query = {"symbol": HOME_SYMBOL, "interval": interval, "limit": 50_000}
    response = client.get("/api/bars", params=query)
    assert response.status_code == 200, response.text
    return response.json()["bars"]


def test_a_dwelling_symbol_follows_its_index(client: TestClient) -> None:
    created = put_home(client, noise_pct=0)
    assert created.status_code == 200, created.text
    doc = created.json()
    assert doc["last_date"] is None  # its index sets it
    assert doc["definition"] | {"noise_pct": 0} == {
        **HOME,
        "name": "HOME",
        "series": "dwelling",
        "first_price": 100.0,
        "noise_pct": 0,
        "causal": False,
        "lag_months": 2,
    }
    info = client.get("/api/symbols", params={"query": "home"}).json()[0]
    assert (info["currency"], info["has_volume"], info["type"]) == ("ILS", False, "synthetic")
    days = home_bars(client)
    # The test index: 2026-06-01 580.1, 2026-07-01, 2026-08-01 588.2 (a Saturday: it is the close
    # of Monday 2026-08-03).
    weekdays = int(np.busday_count(np.datetime64("2026-06-01"), np.datetime64("2026-08-01"))) + 1
    assert len(days) == weekdays
    assert days[0]["time"] == "2026-06-01"
    assert days[0]["close"] == pytest.approx(100.0)
    assert all(b["volume"] == 0 for b in days)
    assert days[-1]["time"] == "2026-08-03"
    assert days[-1]["close"] == pytest.approx(100.0 * 588.2 / 580.1)
    assert len(home_bars(client, "1h")) == 7 * weekdays
    assert len(home_bars(client, "4h")) == 2 * weekdays


def test_a_causal_dwelling_symbol_ends_yesterday(client: TestClient) -> None:
    put_home(client, causal=True, lag_months=1)
    days = home_bars(client)
    today = np.datetime64(dt.datetime.now(dt.UTC).date(), "D")
    assert days[-1]["time"] == str(
        np.busday_offset(today - np.timedelta64(1, "D"), 0, roll="backward")
    )
    assert days[0]["time"] == "2026-07-01"  # June's value, published a month later


def test_a_district_and_an_edit_of_the_kind(client: TestClient) -> None:
    put_home(client, series="dwelling_telaviv", first_price=1000)
    assert home_bars(client)[0]["close"] == pytest.approx(1000.0, rel=0.05)
    # The same name edited in place into a lab scenario, and back.
    walk = {**WALK, "name": "home"}
    edited = client.put(f"{URL}/{HOME_SYMBOL}", json={"revision": 1, "definition": walk})
    assert edited.json()["definition"]["kind"] == "scenario"
    assert put_home(client, revision=2).json()["definition"]["kind"] == "dwelling"


@pytest.mark.parametrize(
    "changes",
    [
        {"series": "dwelling_mars"},
        {"noise_pct": 5.1},
        {"noise_pct": -0.1},
        {"lag_months": 13},
        {"first_price": 0},
        {"kind": "moon"},
        {"seed": -1},
    ],
)
def test_invalid_dwelling_definitions_are_a_422(
    client: TestClient, changes: dict[str, Any]
) -> None:
    assert put_home(client, **changes).status_code == 422


def test_a_dwelling_symbol_in_a_planner_mix(client: TestClient) -> None:
    put_home(client)
    body = {
        "assets": [{"symbol": HOME_SYMBOL, "currency": "ILS"}],
        "use_fx": False,
        "deposits": [{"date": "2026-06-10", "amount": 1000, "time": "17:00"}],
        "end": "2026-07-20",
        "taxes": {"gains_pct": 0, "dividend_pct": 0},
    }
    response = client.post("/api/planner/market", json=body)
    assert response.status_code == 200, response.text


def test_a_body_without_kind_is_a_lab_scenario(client: TestClient) -> None:
    # K0's API had no "kind": such a body still creates a lab scenario.
    body = {k: v for k, v in WALK.items() if k != "kind"}
    response = client.put(f"{URL}/{SYMBOL}", json={"revision": 0, "definition": body})
    assert response.status_code == 200, response.text
    assert response.json()["definition"]["kind"] == "scenario"


# --- K2: a parametric symbol --------------------------------------------------------------------

PAR: dict[str, Any] = {
    "kind": "parametric",
    "name": "par",
    "full_name": "Fat tails",
    "seed": 3,
    "first_date": "2015-01-02",
    "bars": 800,
    "distribution": "student_t",
    "df": 4,
    "garch_alpha": 0.08,
    "garch_beta": 0.9,
    "jumps_per_year": 2,
}
PAR_SYMBOL = "SYN:PAR"


def put_par(client: TestClient, revision: int = 0, **changes: Any) -> Any:
    return client.put(
        f"{URL}/{PAR_SYMBOL}", json={"revision": revision, "definition": {**PAR, **changes}}
    )


def par_bars(client: TestClient, interval: str, **params: Any) -> list[dict[str, Any]]:
    query = {"symbol": PAR_SYMBOL, "interval": interval, "limit": 50_000, **params}
    response = client.get("/api/bars", params=query)
    assert response.status_code == 200, response.text
    return response.json()["bars"]


def test_a_parametric_symbol(client: TestClient) -> None:
    created = put_par(client)
    assert created.status_code == 200, created.text
    doc = created.json()
    assert doc["last_date"] == "2018-01-25"  # the 800th weekday from 2015-01-02
    assert doc["definition"]["mean_pct"] == 7.0
    assert doc["definition"]["vol_pct"] == 18.0
    days = par_bars(client, "1D")
    assert len(days) == 800
    assert days[0]["close"] == pytest.approx(100.0)
    assert len(par_bars(client, "1h")) == 7 * 800
    info = client.get("/api/symbols", params={"query": "fat"}).json()[0]
    assert (info["has_volume"], info["currency"]) == (True, "ILS")


@pytest.mark.parametrize("exact", [False, True])
def test_replay_sees_only_bars_up_to_the_cursor_of_a_parametric_symbol(
    client: TestClient, exact: bool
) -> None:
    put_par(client, exact=exact)
    for interval in ("1h", "4h", "1D"):
        full = par_bars(client, interval)
        cut = par_bars(client, interval, until="2016-06-15")
        assert 0 < len(cut) < len(full)
        assert cut == full[: len(cut)]


def test_inconsistent_parametric_statistics_are_a_422(client: TestClient) -> None:
    response = put_par(client, jumps_per_year=30, jump_sd_pct=10)
    assert response.status_code == 422
    assert put_par(client, garch_alpha=0.3, garch_beta=0.7).status_code == 422
    assert put_par(client, df=2).status_code == 422
    assert put_par(client, first_date="2100-01-01").status_code == 422


def test_the_preview_draws_what_the_symbol_would(client: TestClient) -> None:
    body = {"seed": 3, "bars": 3000, "distribution": "skew_normal", "skew": -4}
    response = client.post(f"{URL}/preview", json=body)
    assert response.status_code == 200, response.text
    preview = response.json()
    assert sum(preview["counts"]) == 2999  # the first day is the first price
    assert len(preview["edges"]) == len(preview["counts"]) + 1
    assert preview["family_skewness"] == pytest.approx(-0.78, abs=0.01)
    assert preview["skewness"] == pytest.approx(preview["family_skewness"], abs=0.15)
    assert preview["vol_pct"] == pytest.approx(18, rel=0.05)
    assert preview["floored"] == 0
    bad = client.post(f"{URL}/preview", json={**body, "jumps_per_year": 40, "jump_sd_pct": 10})
    assert bad.status_code == 422


# K3: a shuffled copy of a market symbol (the e2e universe: AAPL has 6,500 daily bars).

COPY_SYMBOL = "SYN:CP"
COPY: dict[str, Any] = {
    "kind": "shuffle",
    "name": "CP",
    "full_name": "AAPL shuffled",
    "source": "AAPL",
    "start": "2010-01-04",
    "end": "2019-12-31",
    "block_days": 21,
    "seed": 1,
}


def put_copy(client: TestClient, **changes: Any) -> Any:
    return client.put(
        f"{URL}/{COPY_SYMBOL}", json={"revision": 0, "definition": {**COPY, **changes}}
    )


def bars_of(client: TestClient, symbol: str, interval: str, **params: Any) -> list[dict[str, Any]]:
    query = {"symbol": symbol, "interval": interval, "limit": 50_000, **params}
    response = client.get("/api/bars", params=query)
    assert response.status_code == 200, response.text
    return response.json()["bars"]


def test_a_shuffled_copy_has_the_sources_dates_ends_and_volume(e2e_client: TestClient) -> None:
    created = put_copy(e2e_client, currency="ILS", has_volume=False)
    assert created.status_code == 200, created.text
    stored = created.json()["definition"]
    # The source's, whatever the body said.
    assert (stored["currency"], stored["has_volume"], stored["decimals"]) == ("USD", True, 2)
    assert created.json()["last_date"] == "2019-12-31"
    window = {"start": "2010-01-04", "end": "2019-12-31"}
    source = bars_of(e2e_client, "AAPL", "1D", **window)
    copy = bars_of(e2e_client, COPY_SYMBOL, "1D")
    assert [b["time"] for b in copy] == [b["time"] for b in source]
    assert copy[0] == source[0]
    assert copy[-1]["close"] == pytest.approx(source[-1]["close"], rel=1e-9)
    assert [b["close"] for b in copy] != [b["close"] for b in source]
    hours = bars_of(e2e_client, COPY_SYMBOL, "1h")
    assert len(hours) == 7 * len(copy)
    info = e2e_client.get("/api/symbols", params={"query": "AAPL shuffled"}).json()[0]
    assert (info["has_volume"], info["currency"], info["type"]) == (True, "USD", "synthetic")


def test_a_copy_of_an_index_has_no_volume(e2e_client: TestClient) -> None:
    assert put_copy(e2e_client, source="^gspc", start="2016-01-04").status_code == 200
    info = e2e_client.get("/api/symbols", params={"query": "AAPL shuffled"}).json()[0]
    assert info["has_volume"] is False


def test_replay_sees_only_bars_up_to_the_cursor_of_a_copy(e2e_client: TestClient) -> None:
    put_copy(e2e_client)
    for interval in ("1h", "4h", "1D"):
        full = bars_of(e2e_client, COPY_SYMBOL, interval)
        cut = bars_of(e2e_client, COPY_SYMBOL, interval, until="2015-06-15")
        assert 0 < len(cut) < len(full)
        assert cut == full[: len(cut)]


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"source": "SYN:WALK"}, "market symbol"),
        ({"source": "ZZZZ"}, "not a market symbol"),
        ({"end": "2100-01-01"}, "before today"),
        ({"end": "2010-03-01"}, "needs 100"),
        ({"end": "2010-12-31", "block_days": 300}, "nothing to shuffle"),
        ({"end": "2009-01-01"}, "after start"),
    ],
)
def test_a_copy_that_cannot_be_made_is_a_422(
    e2e_client: TestClient, changes: dict[str, Any], message: str
) -> None:
    response = put_copy(e2e_client, **changes)
    assert response.status_code == 422, response.text
    assert message in response.text


def test_the_shuffle_preview_fills_the_range_and_keeps_the_ends(e2e_client: TestClient) -> None:
    response = e2e_client.post(f"{URL}/shuffle/preview", json={"source": "AAPL", "seed": 2})
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["start"] == "2001-12-24"
    assert preview["end"] == "2026-11-20"  # the last bar before today
    assert preview["bars"] == 6500
    assert preview["blocks"] == -(-6499 // 21)
    assert len(preview["dates"]) == 400
    assert (preview["dates"][0], preview["dates"][-1]) == ("2001-12-24", "2026-11-20")
    assert preview["source_close"][0] == preview["copy_close"][0]
    assert preview["copy_close"][-1] == pytest.approx(preview["source_close"][-1], rel=1e-9)
    source, copy = preview["source_measures"], preview["copy_measures"]
    assert copy["total_return_pct"] == pytest.approx(source["total_return_pct"], rel=1e-9)
    assert copy["max_drawdown_pct"] != source["max_drawdown_pct"]
    bad = e2e_client.post(f"{URL}/shuffle/preview", json={"source": "SYN:CP", "seed": 2})
    assert bad.status_code == 422
