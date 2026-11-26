"""``/api/planner/run`` and ``/api/planner/study`` on the synthetic e2e data: AAPL's bars from
2001-12-24, a dwelling index and a CPI that grow by a constant rate from 1994 to 2026-08, and a
Bank of Israel rate in steps (10 % from 1994, 4 % from 2005, 0.25 % from 2015)."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(e2e_client: TestClient) -> TestClient:
    return e2e_client


HOME: dict[str, Any] = {
    "start": "2010-01-15",
    "price": 1_500_000,
    "equity": 600_000,
    "tracks": [
        {"months": 240, "rate_pct": 5},
        {"months": 240, "kind": "prime", "rate_pct": -0.5},
    ],
    "rent": {"mode": "live", "monthly": 4_000},
    "owner": {"maintenance_pct": 0.5},
}
MARKET: dict[str, Any] = {"assets": [{"symbol": "AAPL"}], "use_fx": False}
BASE: dict[str, Any] = {"x": {"home": HOME}, "y": {"market": MARKET}, "end": "2020-01-15"}
HISTORICAL = {
    "value": {"mode": "historical"},
    "rates": {"mode": "historical"},
}


def post(client: TestClient, path: str, **changes: Any) -> dict[str, Any]:
    response = client.post(f"/api/planner/{path}", json={**BASE, **changes})
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------- one scenario


def test_an_apartment_against_its_mirror(client: TestClient) -> None:
    body = post(client, "run")
    x, y = body["x"], body["y"]
    assert (body["start"], body["end"], body["months"]) == ("2010-01-15", "2020-01-15", 120)
    # The mirror invests everything the apartment costs, when it costs it.
    assert x["own"] == pytest.approx(body["spent"])
    assert (x["topped_up"], y["own"]) == (0, 0)
    assert y["topped_up"] == pytest.approx(body["spent"])
    assert y["account"]["deposited"] == pytest.approx(body["spent"])
    assert x["account"] is None
    assert y["home"] is None
    assert body["difference"] == pytest.approx(x["wealth"] - y["wealth"])
    # The apartment's side is the apartment of /planner/home, less the last month's bills.
    alone = client.post(
        "/api/planner/home", json={**HOME, "end": "2020-01-15"}
    ).json()  # fmt: skip
    last = alone["path"][-1]
    assert x["home"]["net_worth"] == pytest.approx(alone["summary"]["net_worth"])
    assert x["wealth"] == pytest.approx(
        alone["summary"]["net_worth"] - last["payment"] - last["costs"] + last["rent"]
    )
    assert x["xirr"] == pytest.approx(alone["summary"]["xirr"], abs=1e-9)
    assert body["warnings"] == []


def test_the_breakeven_rates_and_the_time_average(client: TestClient) -> None:
    body = post(client, "run")
    breakeven = body["breakeven"]
    # AAPL's synthetic walk beats 3 % a year: the apartment needs more appreciation than it has.
    assert body["difference"] < 0
    assert 0.03 < breakeven["appreciation"] < 0.5
    assert -0.5 < breakeven["market_return"] < 0.2
    assert breakeven["rent_scale"] > 1
    assert breakeven["mortgage_shift"] is None  # no rate in the range makes up the gap
    points = body["average"]["points"]
    assert [p["months"] for p in points] == list(range(2, 121, 2))
    assert (points[0]["date"], points[-1]["date"]) == ("2010-03-15", "2020-01-15")
    assert points[-1]["x"] == pytest.approx(body["x"]["wealth"])
    assert body["average"]["x"] == pytest.approx(sum(p["x"] for p in points) / 60)
    # Purchase costs (3 % of 1.5 million) are money both options put in, not end value.
    costs = post(
        client, "run", x={"home": {**HOME, "purchase": {"lawyer_pct": 1, "broker_pct": 2}}}
    )
    assert costs["spent"] - body["spent"] == pytest.approx(45_000)
    # They are deducted from the betterment tax's gain: the only change of the end value.
    saved = body["x"]["home"]["betterment_tax"] - costs["x"]["home"]["betterment_tax"]
    assert saved > 0
    assert costs["x"]["wealth"] - body["x"]["wealth"] == pytest.approx(saved)
    assert costs["y"]["account"]["deposited"] - body["y"]["account"]["deposited"] == pytest.approx(
        45_000
    )
    # Without a rent there is no rent to scale, without an account no market return.
    bare = post(client, "run", x={"home": {**HOME, "rent": {"mode": "none"}}})
    assert bare["breakeven"]["rent_scale"] is None


def test_an_apartment_with_its_own_account_against_an_empty_mirror(client: TestClient) -> None:
    saver = {
        "home": HOME,
        "market": {**MARKET, "recurring": [{"start": "2010-01-15", "amount": 1_000, "count": 120}]},
    }
    body = post(client, "run", x=saver, y={})
    alone = post(client, "run")
    assert body["spent"] == pytest.approx(alone["spent"] + 120_000)
    assert body["x"]["account"]["deposited"] == pytest.approx(120_000)
    assert body["y"]["account"]["deposited"] == pytest.approx(body["spent"])
    # The same asset on both sides: the account adds the same to each, less its tax.
    assert body["difference"] == pytest.approx(alone["difference"], rel=0.2)


def test_scenarios_that_cannot_run_say_why(client: TestClient) -> None:
    def refused(**changes: Any) -> str:
        response = client.post("/api/planner/run", json={**BASE, **changes})
        assert response.status_code == 422, response.text
        return response.json()["detail"]

    assert "nothing to compare" in refused(x={}, y={})
    assert "nothing to compare" in refused(x={}, y={"market": MARKET})
    assert "asset mix" in refused(y={"home": {**HOME, "price": 1_200_000}})
    assert "AAPL has no data before 2001-12-24" in refused(
        x={"home": {**HOME, "start": "2000-01-15"}}, end="2010-01-15"
    )
    other_day = {**HOME, "start": "2010-01-20"}
    assert "sold on the end date" in refused(y={"home": other_day, "market": MARKET})
    timed = {**MARKET, "deposits": [{"date": "2012-01-15", "amount": 100, "time": "10:00"}]}
    notes = post(client, "run", y={"market": timed})["warnings"]
    assert any("times of day" in note for note in notes)
    apart = {**MARKET, "deposits": [{"date": "2012-01-20", "amount": 50_000}]}
    notes = post(client, "run", y={"market": apart})["warnings"]
    assert any("50,000 more than the larger plan alone" in note for note in notes)


def test_what_a_run_leaves_out_is_said(client: TestClient) -> None:
    # A deposit after the apartment is sold (a month date before the end) is not in the plan.
    late = {**MARKET, "deposits": [{"date": "2020-01-11", "amount": 50_000}]}
    body = post(client, "run", x={"home": HOME, "market": late}, y={}, end="2020-01-12")
    assert body["end"] == "2019-12-15"
    assert "Deposits on or after the day everything is sold are left out" in body["warnings"]
    assert body["x"]["account"] is None
    # An apartment bought two years in cannot be sold in the first two: fewer exit months.
    second = {"home": {**HOME, "start": "2012-01-15"}, "market": MARKET}
    notes = post(client, "run", y=second)["warnings"]
    assert "The net worth is averaged over 48 of 60 exit months" in " ".join(notes)


def test_what_the_answer_depends_on(client: TestClient) -> None:
    body = post(client, "run")
    # The apartment's return, shared between its four sources: they add up to it.
    parts = body["decomposition"]
    assert sum(parts[name] for name in ("appreciation", "rent", "leverage", "costs")) == (
        pytest.approx(parts["total"], abs=1e-12)
    )
    assert parts["total"] == pytest.approx(body["x"]["xirr"], abs=1e-9)  # no surplus month
    assert parts["appreciation"] > 0
    # One input moved each way, as a change of "apartment minus market".
    moves = {m["input"]: m for m in body["sensitivity"]}
    assert list(moves) == ["appreciation", "mortgage_rates", "rent", "market_return", "taxes"]
    assert moves["appreciation"]["down"] < 0 < moves["appreciation"]["up"]
    assert moves["market_return"]["up"] < 0 < moves["market_return"]["down"]
    assert (moves["rent"]["step"], moves["taxes"]["step"]) == (0.1, 0.05)
    # Who leads over the exit months, from the same points as the time average.
    lead = body["lead"]
    points = body["average"]["points"]
    ahead = [p["x"] > p["y"] for p in points]
    assert lead["step_months"] == 2
    assert lead["x_share"] == pytest.approx(sum(ahead) / len(ahead))
    assert lead["leader"] == ("x" if ahead[-1] else "y")
    assert lead["since_months"] in [p["months"] for p in points]
    # A forced sale takes 10 % off the apartment's value; the account is cash as it is.
    liquid = body["liquidity"]
    assert liquid["discount"] == 0.10
    x, y = liquid["x"], liquid["y"]
    assert (x["cash"], y["apartment"], y["forced"]) == (0, None, None)
    assert y["cash"] == pytest.approx(body["y"]["account"]["net_value"])
    assert x["apartment"] == pytest.approx(body["x"]["home"]["net_worth"])
    lost = x["apartment"] - x["forced"]
    assert 0 < lost <= 0.10 * body["x"]["home"]["value"]
    assert x["wealth_forced"] == pytest.approx(body["x"]["wealth"] - lost)
    assert y["wealth_forced"] == pytest.approx(body["y"]["wealth"])
    assert points[-1]["x_forced"] == pytest.approx(x["wealth_forced"])
    assert all(p["x_forced"] < p["x"] and p["y_forced"] is None for p in points)
    # The synthetic dwelling index never moves off its trend: no correlation to report.
    assert body["correlation"] is None
    free = post(client, "run", forced_discount_pct=0)
    assert all(p["x_forced"] == pytest.approx(p["x"]) for p in free["average"]["points"])
    assert free["liquidity"]["discount"] == 0


def test_a_breakeven_market_return_says_when_the_mixes_differ(client: TestClient) -> None:
    other = {"market": {**MARKET, "assets": [{"symbol": "NVDA"}]}}
    apartment = {"home": {**HOME, "start": "2016-01-15"}, "market": MARKET}
    notes = post(client, "run", x=apartment, y=other, end="2021-01-15")["warnings"]
    assert any("hold different mixes" in note for note in notes)
    assert not any("different mixes" in note for note in post(client, "run")["warnings"])


def test_two_market_options_have_no_apartment_to_explain(client: TestClient) -> None:
    saver = {**MARKET, "deposits": [{"date": "2012-01-05", "amount": 1_000}]}
    body = post(client, "run", x={"market": saver}, y={}, end="2014-01-05")
    assert body["decomposition"] is None
    assert [m["input"] for m in body["sensitivity"]] == ["market_return", "taxes"]
    assert body["correlation"] is None


# ---------------------------------------------------------------- rolling windows


def study(client: TestClient, **changes: Any) -> dict[str, Any]:
    body = {"x": {"home": {**HOME, **HISTORICAL}}, "horizons_years": [5, 10]}
    return post(client, "study", **{**body, **changes})


def test_the_study_runs_every_month_the_data_allows(client: TestClient) -> None:
    body = study(client)
    summary = body["summary"]
    # From AAPL's first bar (2001-12-24) to a sale inside the dwelling index (2026-08).
    assert (summary["first"], summary["last"]) == ("2002-01-15", "2016-08-15")
    assert summary["windows"] == len(body["windows"]) == 176
    assert summary["effective"] == pytest.approx((175 + 120) / 120)
    assert "AAPL has no data before 2001-12-24" in body["before"]
    assert "index 'dwelling' covers" in body["after"]
    assert body["months"] == 120
    wins = sum(w["x_wealth"] > w["y_wealth"] for w in body["windows"])
    assert summary["p_win"] == pytest.approx(wins / 176)
    assert body["windows"][0]["start"] == "2002-01-15"


def test_the_win_map_has_a_row_per_start_year(client: TestClient) -> None:
    body = study(client)["win_map"]
    assert body["horizons_years"] == [5, 10]
    assert [row["start"] for row in body["rows"]] == [f"{y}-01-15" for y in range(2002, 2022)]
    by_start = {row["start"]: row["cells"] for row in body["rows"]}
    assert all(cell is not None for cell in by_start["2016-01-15"])
    assert by_start["2017-01-15"][1] is None  # ten years from 2017 is past the data
    assert by_start["2021-01-15"][0] is not None
    cell = by_start["2010-01-15"][1]
    window = next(w for w in study(client)["windows"] if w["start"] == "2010-01-15")
    assert cell["difference"] == pytest.approx(window["x_wealth"] - window["y_wealth"])
    assert (cell["x_xirr"], cell["y_xirr"]) == (window["x_xirr"], window["y_xirr"])


def test_the_rates_follow_the_bank_of_israel_only_when_asked(client: TestClient) -> None:
    follow = {w["start"]: w for w in study(client)["windows"]}
    fixed = {w["start"]: w for w in study(client, follow_rates=False)["windows"]}
    # The rates entered are today's quotes, at a Bank of Israel rate of 0.25 %. In 2002 it was
    # 10 % and in 2008 4 %: the fixed track is dearer there, by more in 2002.
    lost = {day: fixed[day]["x_wealth"] - follow[day]["x_wealth"] for day in follow}
    assert lost["2002-06-15"] > lost["2008-06-15"] > 0
    # From 2015 it is today's rate: the track is the one entered.
    assert lost["2015-06-15"] == 0


def test_a_study_says_when_history_does_not_reach_the_apartment(client: TestClient) -> None:
    assert study(client)["warnings"] == [
        "The schedule after the sale holds the Bank of Israel rate flat past its last "
        "published value"
    ]
    notes = post(client, "study", horizons_years=[5])["warnings"]
    assert any("rates do not follow the Bank of Israel rate" in note for note in notes)
    assert any("differ only by the market" in note for note in notes)
    quiet = post(client, "study", horizons_years=[5], follow_rates=False)["warnings"]
    assert not any("do not follow" in note for note in quiet)


def test_the_study_range_and_step_are_the_requests(client: TestClient) -> None:
    body = study(client, first_start="2005-01-01", last_start="2009-12-31", step_months=3)
    starts = [w["start"] for w in body["windows"]]
    assert starts[:2] == ["2005-01-15", "2005-04-15"]
    assert (starts[-1], len(starts)) == ("2009-10-15", 20)
    assert (body["before"], body["after"]) == (None, None)
    response = client.post(
        "/api/planner/study", json={**BASE, "first_start": "2030-01-01", "last_start": "2031-01-01"}
    )
    assert response.status_code == 422
    assert "No window" in response.json()["detail"]
    # Any dates are a request, not a crash: the range is cut to history.
    wide = study(client, first_start="0001-01-01", last_start="9999-12-31", step_months=12)
    assert wide["summary"]["windows"] == 15
    far = client.post("/api/planner/run", json={**BASE, "end": "9000-01-15"})
    assert (far.status_code, "Dates after 2200" in far.json()["detail"]) == (422, True)


def test_a_study_needs_a_term_and_says_what_its_windows_leave_out(client: TestClient) -> None:
    saver = {**MARKET, "deposits": [{"date": "2012-01-05", "amount": 1_000}]}
    body = {"x": {"market": saver}, "y": {}, "end": "2012-01-25", "last_start": "2013-01-01"}
    assert client.post("/api/planner/run", json=body).json()["months"] == 0
    response = client.post("/api/planner/study", json=body)
    assert response.status_code == 422
    assert "at least a month" in response.json()["detail"]
    # The warnings of the windows are the study's: the deposits after each sale, and the
    # prime track's rate held flat in the years of the schedule after the latest sales.
    long = {**MARKET, "recurring": [{"start": "2010-01-15", "amount": 500, "count": 240}]}
    notes = study(client, x={"home": {**HOME, **HISTORICAL}, "market": long}, y={})["warnings"]
    assert sorted(notes) == [
        "Deposits on or after the day everything is sold are left out",
        "The schedule after the sale holds the Bank of Israel rate flat past its last "
        "published value",
    ]


# ---------------------------------------------------------------- the planner page's request


@pytest.mark.parametrize(
    ("path", "extra"),
    [("run", {}), ("study", {"step_months": 12}), ("simulate", {"runs": 20, "seed": 1})],
)
@pytest.mark.parametrize("surplus", [False, True])
def test_an_option_naming_the_mix_it_would_get_anyway_changes_nothing(
    client: TestClient, path: str, extra: dict[str, Any], surplus: bool
) -> None:
    """The page sends each option its own mix, with no deposits; an apartment option used to
    send none and take the other option's. With the same mix both give one answer, also when
    the rent leaves a surplus to invest."""
    home = {**HOME, "equity": 1_400_000, "rent": {"mode": "rent_out", "monthly": 9_000}}
    x = {"home": home if surplus else HOME}
    alone = post(client, path, x=x, **extra)
    named = post(client, path, x={**x, "market": MARKET}, **extra)
    assert named == alone
    if path == "run":
        assert (alone["x"]["account"] is not None) is surplus
