"""``/api/planner/simulate`` on the synthetic e2e data, with few worlds (the engine's own tests
check the numbers; these check that the request reaches it and the response adds up)."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from tests.api.test_planner_scenario import HISTORICAL, HOME, MARKET


@pytest.fixture
def client(e2e_client: TestClient) -> TestClient:
    return e2e_client


BASE: dict[str, Any] = {
    "x": {"home": {**HOME, **HISTORICAL}},
    "y": {"market": MARKET},
    "end": "2020-01-15",
    "runs": 40,
}


def simulate(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = client.post("/api/planner/simulate", json={**BASE, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def test_a_bootstrap_resamples_the_history_the_series_share(client: TestClient) -> None:
    body = simulate(client)
    assert (body["method"], body["runs"], body["months"], body["market"]) == (
        "bootstrap", 40, 120, None,
    )  # fmt: skip
    # AAPL's first bar is 2001-12-24; the dwelling index ends in 2026-08.
    assert body["history"] == {
        "first": "2002-01-01",
        "last": "2026-08-01",
        "months": 295,
        "effective": pytest.approx(295 / 120),
    }
    samples = body["samples"]
    assert {len(values) for values in samples.values()} == {40}
    x, y = np.array(samples["x_wealth"]), np.array(samples["y_wealth"])
    assert body["p_win"] == pytest.approx(float(np.mean(x > y)))
    assert body["median_difference"] == pytest.approx(float(np.median(x - y)), abs=0.01)
    assert body["dominance"] in {"x_first", "x_second", "y_first", "y_second", "none"}
    for option, wealth in (("x", x), ("y", y)):
        risk = body[option]
        spread = risk["wealth"]
        assert spread["p50"] == pytest.approx(float(np.median(wealth)), abs=0.01)
        assert spread["cvar5"] <= spread["p5"] <= spread["p25"] <= spread["p50"] <= spread["p95"]
        # Ending below the money put in is a negative return: the same worlds either way.
        losing = float(np.mean(np.array(samples[f"{option}_xirr"]) < 0))
        assert risk["shortfall"] == pytest.approx(losing)
        assert 0 <= risk["drawdown_median"] <= risk["drawdown_p95"] <= 1
        assert risk["regret_mean"] >= 0
    # Only the apartment has a loan to fall below; only the market side holds an account.
    assert 0 <= body["x"]["negative_equity"] <= 1
    assert body["y"]["negative_equity"] is None
    assert body["x"]["under_water"] is None
    assert 0 <= body["y"]["under_water"] <= 1
    assert body["x"]["stress"] is None  # no income given


def test_the_same_money_split_between_the_two_options(client: TestClient) -> None:
    body = simulate(client)
    rows = body["split"]
    assert [row["weight"] for row in rows] == [0.0, 0.25, 0.5, 0.75, 1.0]
    # All of it in one option is that option's own spread of real end values.
    for row, option in ((rows[0], "y"), (rows[-1], "x")):
        spread = body[option]["wealth_real"]
        assert (row["p50"], row["p5"], row["cvar5"]) == pytest.approx(
            (spread["p50"], spread["p5"], spread["cvar5"])
        )
    x = np.array(body["samples"]["x_wealth_real"])
    y = np.array(body["samples"]["y_wealth_real"])
    assert rows[2]["p50"] == pytest.approx(float(np.median(0.5 * x + 0.5 * y)), abs=0.02)
    assert all(row["cvar5"] <= row["p5"] <= row["p50"] for row in rows)


def test_the_worlds_depend_only_on_the_seed(client: TestClient) -> None:
    first = simulate(client)["samples"]
    assert simulate(client)["samples"] == first
    assert simulate(client, seed=2)["samples"] != first
    # Fewer worlds are the first of the same worlds.
    fewer = simulate(client, runs=20)["samples"]
    assert fewer["x_wealth"] == first["x_wealth"][:20]
    assert fewer["y_xirr"] == first["y_xirr"][:20]
    assert simulate(client, block_months=24)["samples"] != first


def test_a_monte_carlo_models_the_market(client: TestClient) -> None:
    assumed = {"x": {"home": HOME}}
    body = simulate(client, method="monte_carlo", **assumed)
    market = body["market"]
    # Estimated from AAPL's synthetic walk: a high growth and a high volatility.
    assert market["estimated"] is True
    assert 0.05 < market["mean"] < 0.6
    assert 0.2 < market["sd"] < 0.5
    assert body["history"] is None  # the apartment and inflation are assumed too
    notes = " ".join(body["warnings"])
    for text in (
        "rates do not follow",
        "value has no volatility",
        "Inflation has no spread",
        "pays no dividend tax",
    ):
        assert text in notes
    # Without any volatility every world is the same: the market earns exactly its mean.
    flat = simulate(
        client, method="monte_carlo", market_mean_pct=6, market_sd_pct=0, runs=10, **assumed
    )
    assert flat["market"] == {"mean": 0.06, "sd": 0.0, "estimated": False}
    spread = flat["y"]["xirr"]
    assert spread["p5"] == spread["p95"] == pytest.approx(0.06 * (1 - 0.25 * 0.7), abs=0.01)
    assert flat["p_win"] in {0.0, 1.0}
    assert flat["dominance"] in {"x_first", "y_first"}
    winner = "x" if flat["p_win"] == 1.0 else "y"
    assert (flat[winner]["regret_mean"], flat[winner]["regret_p95"]) == (0.0, 0.0)
    assert flat["x"]["sharpe"] is None or flat["x"]["sharpe"] > 0


def test_income_turns_the_payment_stress_on(client: TestClient) -> None:
    body = simulate(client, income=20_000, stress_share_pct=30)
    assert body["y"]["stress"] is None
    assert 0 <= body["x"]["stress"] <= 1
    # 900,000 at about 5 % over 20 years is near 6,000 a month: about 30 % of 20,000.
    assert 0.2 < body["x"]["stress_median"] < 0.6
    assert simulate(client, income=200_000)["x"]["stress"] == 0.0


def test_simulations_that_cannot_run_say_why(client: TestClient) -> None:
    def refused(**changes: Any) -> str:
        response = client.post("/api/planner/simulate", json={**BASE, **changes})
        assert response.status_code == 422, response.text
        return str(response.json())

    assert "too few for blocks of 120" in refused(
        y={"market": {**MARKET, "assets": [{"symbol": "SPY"}]}}, block_months=120
    )
    assert "runs" in refused(runs=5)
    # Half a market model is not a model: no guessing which half was meant.
    assert "both the market's mean and its volatility" in refused(
        method="monte_carlo", market_mean_pct=6
    )
    dollars = {**MARKET, "taxes": {"base": "currency"}}
    notes = simulate(client, method="monte_carlo", y={"market": dollars}, runs=10)["warnings"]
    assert any("taxes the nominal gain" in note for note in notes)
    assert "correlation" in refused(correlation=2)
    notes = simulate(client, correlation=0.5)["warnings"]
    assert any("applies only to a modelled market" in note for note in notes)
    # A modelled market, but the apartment's value is the resampled index: nothing to tie.
    notes = simulate(client, correlation=0.5, method="monte_carlo", runs=10)["warnings"]
    assert any("The correlation has no effect" in note for note in notes)
    tied = simulate(client, correlation=0.5, method="monte_carlo", runs=10, x={"home": HOME})[
        "warnings"
    ]
    assert not any("correlation" in note for note in tied)


def test_different_mixes_are_one_market_in_a_monte_carlo(client: TestClient) -> None:
    other = {"market": {**MARKET, "assets": [{"symbol": "NVDA"}]}}
    apartment = {"home": {**HOME, "start": "2016-01-15"}, "market": MARKET}
    late = {"x": apartment, "y": other, "end": "2021-01-15", "runs": 10}
    notes = simulate(client, method="monte_carlo", **late)["warnings"]
    assert any("hold different mixes" in note for note in notes)
    # A bootstrap resamples each mix as it is: nothing to warn about.
    assert not any("different mixes" in note for note in simulate(client, **late)["warnings"])
    same = simulate(client, method="monte_carlo", runs=10, x={"home": HOME, "market": MARKET})
    assert not any("different mixes" in note for note in same["warnings"])


def test_an_apartments_own_volatility_reaches_the_worlds(client: TestClient) -> None:
    def spread(own: float) -> float:
        home = {**HOME, **HISTORICAL, "value": {"mode": "historical", "own_sd_pct": own}}
        return float(np.std(simulate(client, x={"home": home})["samples"]["x_wealth"]))

    # The synthetic index grows at a constant rate: only the rates move the apartment's end
    # value, until it gets a volatility of its own.
    assert spread(10) > 3 * spread(0)
