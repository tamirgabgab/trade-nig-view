"""``/api/planner/withdraw/study`` and ``/simulate`` (J2): one plan over the windows of history
and over simulated worlds, on the synthetic e2e data (AAPL's bars from 2001-12-24 to 2026-11-20;
the CPI and the dwelling index from 1994-01 to 2026-08)."""

from __future__ import annotations

from itertools import pairwise
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.api.test_planner_withdraw import FLAT


@pytest.fixture
def client(e2e_client: TestClient) -> TestClient:
    return e2e_client


#: Ten years from AAPL's history: 6,000 a month from 1,000,000, half of it cost.
MIX: dict[str, Any] = {
    **FLAT,
    "start": "2010-01-15",
    "months": 120,
    "cost_share_pct": 50,
    "rule": {"kind": "fixed", "amount": 6_000, "indexed": False},
    "returns": {"mode": "mix"},
}
HOME: dict[str, Any] = {"value": 2_000_000, "growth": "index", "selling_pct": 2}


def post(client: TestClient, path: str, **changes: Any) -> Any:
    return client.post(f"/api/planner/withdraw{path}", json={**MIX, **changes})


def study(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = post(client, "/study", **changes)
    assert response.status_code == 200, response.text
    return response.json()


def simulate(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = post(client, "/simulate", **{"runs": 40, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def refused(client: TestClient, path: str, **changes: Any) -> str:
    response = post(client, path, **changes)
    assert response.status_code == 422, response.text
    return str(response.json()["detail"])


# ---------------------------------------------------------------- windows of history


def test_every_start_the_data_allows_and_the_entered_one_is_the_plan(client: TestClient) -> None:
    body = study(client)
    runs = body["realizations"]
    assert (body["method"], body["months"], body["count"]) == ("windows", 120, len(runs))
    starts = [r["start"] for r in runs]
    # A start a month, from the first the bars allow to the last whose ten years they cover.
    assert (starts[0], starts[-1]) == ("2002-01-15", "2016-11-15")
    assert len(starts) == 179
    assert starts == sorted(set(starts))
    assert "no data before" in body["before"]
    assert "no data after" in body["after"]
    # The window at the entered start is the plan of /planner/withdraw.
    plan = post(client, "").json()["summary"]
    own = runs[starts.index("2010-01-15")]
    assert own["left"] == pytest.approx(plan["balance"])
    assert own["left_real"] == pytest.approx(plan["balance_real"])
    assert own["taken_real"] == pytest.approx(plan["taken_real"])
    assert own["tax"] == pytest.approx(plan["tax"])
    assert own["depleted_month"] == plan["depleted_month"]
    assert body["start_worth"] == 1_000_000
    # About how many separate ten-year terms those starts hold.
    evidence = body["evidence"]
    assert evidence["independent"] == pytest.approx((178 + 120) / 120)
    assert evidence["history_months"] is None


def test_the_bounds_the_curve_and_the_fan(client: TestClient) -> None:
    body = study(client, rule={"kind": "fixed", "amount": 12_000, "indexed": False})
    floor, entered, ceiling = body["bounds"]
    assert [b["cost_share"] for b in body["bounds"]] == [0, 0.5, 1]
    assert floor["lasts"] <= entered["lasts"] <= ceiling["lasts"]
    assert 0 < entered["lasts"] < 1
    runs = body["realizations"]
    lasting = sum(r["depleted_month"] is None for r in runs)
    assert entered["lasts"] == pytest.approx(lasting / len(runs))
    # The share still paying: all at the start, never more later, and at the end those that last.
    curve = body["survival"]
    assert [p["month"] for p in curve] == list(range(0, 121, 12))
    assert curve[0]["share"] == 1
    assert all(a["share"] >= b["share"] for a, b in pairwise(curve))
    assert curve[-1]["share"] == pytest.approx(entered["lasts"])
    assert all(p["floor"] <= p["share"] <= p["ceiling"] for p in curve)
    # The income of every year, as percentiles over the windows.
    fan = body["income"]
    assert [y["year"] for y in fan] == list(range(1, 11))
    assert all(y["p5"] <= y["p25"] <= y["p50"] <= y["p75"] <= y["p95"] for y in fan)
    assert fan[0]["p50"] == pytest.approx(12_000)


def test_the_published_cpi_ends_the_windows(client: TestClient) -> None:
    body = study(client, inflation={"mode": "historical"})
    assert body["realizations"][-1]["start"] == "2016-08-15"
    assert "CPI" in body["after"]
    # On an assumed CPI the page says every window has the same inflation.
    assert any("same inflation" in note for note in study(client)["warnings"])


def test_a_percent_rule_has_an_income_and_no_amount_to_look_for(client: TestClient) -> None:
    body = study(client, rule={"kind": "percent", "percent": 4})
    assert body["sustainable"] is None
    assert all(b["lasts"] == 1 for b in body["bounds"])
    floor, entered, ceiling = (b["lowest_net_real"] for b in body["bounds"])
    assert floor < entered < ceiling


def test_the_sustainable_amount_is_the_edge(client: TestClient) -> None:
    body = study(client, sustain_pct=90)
    found = body["sustainable"]
    assert (found["target_pct"], found["amount"] > 0) == (90, True)

    def lasts(amount: float) -> float:
        rule = {"kind": "fixed", "amount": amount, "indexed": False}
        return float(study(client, rule=rule)["bounds"][1]["lasts"])

    assert lasts(found["amount"]) >= 0.9
    assert lasts(found["amount"] * 1.03) < 0.9


def test_an_apartment_in_every_window(client: TestClient) -> None:
    home = {**HOME, "role": "when_empty", "cost": 900_000, "bought": "2005-01-15"}
    body = study(client, home=home, rule={"kind": "fixed", "amount": 20_000, "indexed": False})
    runs = body["realizations"]
    # The dwelling index is published until 2026-08: the last window ends inside it.
    assert runs[-1]["start"] == "2016-08-15"
    # What there was: the account as if sold (half of it gain, taxed), and the apartment's sale.
    assert body["start_worth"] == pytest.approx(875_000 + 1_960_000)
    assert any(r["home_sold_month"] is not None for r in runs)
    # Its purchase day moves with the window: a start before 2005 is not refused for it.
    assert runs[0]["start"] == "2002-01-15"
    # An assumed growth is the same in every window, and the page says so.
    assumed = study(client, home={**HOME, "growth": "assumed"})
    assert any("same in every window" in note for note in assumed["warnings"])


def test_windows_that_cannot_run(client: TestClient) -> None:
    assert "assumed return" in refused(client, "/study", returns={"mode": "assumed"})
    assert "No start" in refused(client, "/study", months=400)
    assert "last start" in refused(
        client, "/study", first_start="2012-01-01", last_start="2011-01-01"
    )


# ---------------------------------------------------------------- simulated worlds


def test_a_modelled_market_without_volatility_is_the_assumed_plan(client: TestClient) -> None:
    # FLAT: 1,000,000 that does not grow, 10,000 a month for five years: every world leaves
    # 400,000, as the plan on the assumed return does.
    body = simulate(client, **FLAT, method="monte_carlo", market_sd_pct=0)
    assert (body["method"], body["count"]) == ("monte_carlo", 40)
    assert all(r["left"] == pytest.approx(400_000) for r in body["realizations"])
    assert all(r["start"] is None for r in body["realizations"])
    assert body["bounds"][1]["lasts"] == 1
    assert body["market"] == {"mean_pct": 0, "sd_pct": 0, "estimated": False}
    assert body["evidence"]["independent"] is None


def test_worlds_cut_from_the_mix_history(client: TestClient) -> None:
    body = simulate(client)
    assert (body["method"], body["count"]) == ("bootstrap", 40)
    lefts = [r["left"] for r in body["realizations"]]
    assert len(set(lefts)) > 30
    # The same seed, the same worlds; another seed, others.
    assert [r["left"] for r in simulate(client)["realizations"]] == lefts
    assert [r["left"] for r in simulate(client, seed=7)["realizations"]] != lefts
    # The history the worlds were cut from, and how many ten-year terms it holds.
    evidence = body["evidence"]
    assert evidence["history_months"] == pytest.approx(298, abs=2)
    assert evidence["independent"] == pytest.approx(evidence["history_months"] / 120)
    assert body["market"] is None


def test_a_market_model_estimated_from_the_mix(client: TestClient) -> None:
    body = simulate(client, method="monte_carlo")
    market = body["market"]
    assert market["estimated"] is True
    assert market["sd_pct"] > 0
    typed = simulate(client, method="monte_carlo", market_mean_pct=4, market_sd_pct=12)
    assert typed["market"] == {"mean_pct": 4, "sd_pct": 12, "estimated": False}


def test_an_apartment_in_every_world(client: TestClient) -> None:
    body = simulate(client, home={**HOME, "role": "when_empty"})
    assert body["start_worth"] == pytest.approx(875_000 + 1_960_000)
    lefts = {round(r["left"]) for r in body["realizations"]}
    assert len(lefts) > 30


def test_worlds_that_cannot_run(client: TestClient) -> None:
    assumed = {"returns": {"mode": "assumed", "yearly_pct": 5}}
    assert "assumed return" in refused(client, "/simulate", **assumed)
    assert "volatility" in refused(client, "/simulate", **assumed, method="monte_carlo")
    assert post(client, "/simulate", runs=5).status_code == 422


# ---------------------------------------------------------------- the months in reverse


def test_one_plan_with_its_market_months_in_reverse(client: TestClient) -> None:
    percent = post(client, "", rule={"kind": "percent", "percent": 4}).json()
    back, forth = percent["reversed"], percent["summary"]
    assert back["balance"] == pytest.approx(forth["balance"])
    assert back["taken"] != pytest.approx(forth["taken"])
    fixed = post(client, "").json()
    assert fixed["reversed"]["balance"] != pytest.approx(fixed["summary"]["balance"])
    # An assumed return has no order to reverse.
    assert client.post("/api/planner/withdraw", json=FLAT).json()["reversed"] is None
