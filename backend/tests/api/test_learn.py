from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any, get_args

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.analysis.events import event_study
from app.analysis.synthetic import Scenario, synthetic_bars
from app.api.learn import CONCEPT_PAGES
from app.config import Settings
from app.indicators.catalog import CATALOG
from app.indicators.registry import Category
from app.main import create_app
from tests.api.test_analysis import E2E_DATA
from tests.conftest import IsolatedSettings


@pytest.mark.parametrize("slug", sorted({spec.learn_slug for spec in CATALOG.values()}))
def test_serves_every_registered_learn_page(client: TestClient, slug: str) -> None:
    response = client.get(f"/api/learn/{slug}")
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == slug
    assert body["markdown"].startswith("# ")


@pytest.mark.parametrize("slug", ["nope", "README", "..%2F..%2Fpyproject"])
def test_unregistered_slugs_are_not_found(client: TestClient, slug: str) -> None:
    response = client.get(f"/api/learn/{slug}")
    assert response.status_code == 404


# --- index and concept pages ----------------------------------------------------------------------


def test_index_lists_every_indicator_page_once(client: TestClient) -> None:
    response = client.get("/api/learn")
    assert response.status_code == 200
    pages = response.json()["pages"]
    indicator_pages = [p for p in pages if p["kind"] == "indicator"]
    slugs = [p["slug"] for p in indicator_pages]
    assert sorted(slugs) == sorted({spec.learn_slug for spec in CATALOG.values()})
    by_slug = {p["slug"]: p for p in indicator_pages}
    assert by_slug["rsi"] == {
        "slug": "rsi",
        "title": "Relative Strength Index",
        "kind": "indicator",
        "category": "oscillators",
        "indicator_id": "rsi",
    }
    assert by_slug["moving-average"]["indicator_id"] == "ma"
    assert by_slug["moving-average"]["title"] == "Moving Average, any type"
    assert all("`" not in p["title"] for p in pages)
    order = list(get_args(Category))
    keys = [(order.index(p["category"]), p["title"].lower()) for p in indicator_pages]
    assert keys == sorted(keys)


def concept_settings(settings: Settings, tmp_path: Path, files: dict[str, str]) -> Settings:
    learn_dir = tmp_path / "learn"
    learn_dir.mkdir()
    for name, text in files.items():
        (learn_dir / name).write_text(text, encoding="utf-8")
    return settings.model_copy(update={"learn_dir": learn_dir})


def test_concept_pages_are_listed_and_served_when_present(
    settings: Settings, tmp_path: Path
) -> None:
    patched = concept_settings(
        settings, tmp_path, {"combinations.md": "# Combining indicators\n", "rsi.md": "no heading"}
    )
    with TestClient(create_app(patched)) as c:
        pages = c.get("/api/learn").json()["pages"]
        assert pages[-1] == {
            "slug": "combinations",
            "title": "Combining indicators",
            "kind": "concept",
            "category": None,
            "indicator_id": None,
        }
        assert [p["kind"] for p in pages].count("concept") == len(CONCEPT_PAGES)
        # a page without a heading falls back to the spec name; one without a file is not listed
        titles = {p["slug"]: p["title"] for p in pages}
        assert titles["rsi"] == CATALOG["rsi"].name
        assert "sma" not in titles
        page = c.get("/api/learn/combinations")
        assert page.status_code == 200
        assert page.json()["markdown"] == "# Combining indicators\n"


def test_missing_concept_page_is_not_listed(settings: Settings, tmp_path: Path) -> None:
    with TestClient(create_app(concept_settings(settings, tmp_path, {}))) as c:
        assert all(p["kind"] == "indicator" for p in c.get("/api/learn").json()["pages"])
        missing = c.get("/api/learn/combinations")
        assert missing.status_code == 404
        assert missing.json()["code"] == "learn_page_not_found"


# --- lab ------------------------------------------------------------------------------------------


@pytest.fixture
def e2e_client(tmp_path: Path) -> Iterator[TestClient]:
    """The synthetic e2e universe (thousands of daily bars per symbol)."""
    settings = IsolatedSettings(
        offline=True,
        chartlab_data_dir=tmp_path / "data",
        universe_file=E2E_DATA / "universe.toml",
        fixtures_dir=E2E_DATA,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def lab(client: TestClient, body: dict[str, Any], status: int = 200) -> dict[str, Any]:
    response = client.post("/api/learn/lab", json=body)
    assert response.status_code == status, response.text
    if status != 200:
        assert response.headers["content-type"].startswith("application/problem+json")
    return response.json()


RSI_BELOW_30: dict[str, Any] = {
    "left": {"indicator": 0, "output": "rsi"},
    "op": "lt",
    "right": {"value": 30},
}


def test_synthetic_defaults_without_conditions(client: TestClient) -> None:
    body = lab(client, {"source": {"kind": "synthetic"}})
    frame = synthetic_bars(Scenario.RANDOM_WALK, 1, 500)
    assert body["time"][:3] == ["2020-01-01", "2020-01-02", "2020-01-03"]
    assert len(body["time"]) == 500
    assert body["close"] == frame.close.tolist()
    assert body["open"] == frame.open.tolist()
    assert body["volume"] == frame.volume.tolist()
    assert body["indicators"] == []
    assert body["study"] is None


def test_synthetic_with_indicator_and_study(client: TestClient) -> None:
    request = {
        "source": {"kind": "synthetic", "scenario": "range", "seed": 42, "bars": 800},
        "indicators": [{"id": "rsi", "params": {"length": 10}}],
        "conditions": [RSI_BELOW_30],
        "horizon": 5,
    }
    body = lab(client, request)
    frame = synthetic_bars(Scenario.RANGE, 42, 800)
    (ind,) = body["indicators"]
    assert ind["id"] == "rsi"
    assert ind["params"] == {**CATALOG["rsi"].defaults(), "length": 10}
    assert ind["display_shift"] == 0
    rsi = CATALOG["rsi"].run(frame, {"length": 10})["rsi"]
    assert ind["outputs"]["rsi"][:10] == [None] * 10
    np.testing.assert_allclose(ind["outputs"]["rsi"][10:], rsi[10:], rtol=1e-12)
    study = body["study"]
    expected = event_study(frame.close, np.nan_to_num(rsi, nan=100.0) < 30, 5)
    assert study["horizon"] == 5
    assert study["event_index"] == expected.event_index.tolist()
    assert study["events"]["n"] == expected.events.n > 0
    assert study["baseline"]["n"] == 795
    assert study["edge"] == pytest.approx(expected.edge)
    assert study["t_stat"] == pytest.approx(expected.t_stat)
    assert study["ci95"] == pytest.approx(list(expected.ci95))
    hist = study["histogram"]
    assert len(hist["edges"]) == 22
    assert sum(hist["events"]) == pytest.approx(1.0)
    assert sum(hist["baseline"]) == pytest.approx(1.0)


def test_undefined_numbers_are_null(client: TestClient) -> None:
    never = {"left": {"price": "close"}, "op": "lt", "right": {"value": 0}}
    study = lab(client, {"source": {"kind": "synthetic"}, "conditions": [never]})["study"]
    assert study["events"] == {"n": 0, "mean": None, "median": None, "std": None, "hit_rate": None}
    assert (study["edge"], study["se"], study["t_stat"]) == (None, None, None)
    assert study["ci95"] == [None, None]
    assert study["event_index"] == []
    assert study["histogram"]["events"] == [0.0] * 21


def test_symbol_source_uses_the_last_bars(e2e_client: TestClient) -> None:
    body = lab(
        e2e_client,
        {
            "source": {"kind": "symbol", "symbol": "NVDA", "bars": 300},
            "indicators": [{"id": "ma_cross"}],
            "conditions": [
                {
                    "left": {"indicator": 0, "output": "fast"},
                    "op": "crosses_above",
                    "right": {"indicator": 0, "output": "slow"},
                }
            ],
        },
    )
    bars = e2e_client.get("/api/bars", params={"symbol": "NVDA", "limit": 300}).json()["bars"]
    assert body["time"] == [b["time"] for b in bars]
    assert body["close"] == [b["close"] for b in bars]
    assert set(body["indicators"][0]["outputs"]) == {"fast", "slow", "crosses"}
    assert body["study"]["baseline"]["n"] == 290


def test_unknown_symbol_is_404(client: TestClient) -> None:
    body = lab(client, {"source": {"kind": "symbol", "symbol": "NOPE"}}, 404)
    assert body["code"] == "symbol_not_found"


def test_unknown_indicator_is_404(client: TestClient) -> None:
    body = lab(client, {"source": {"kind": "synthetic"}, "indicators": [{"id": "nope"}]}, 404)
    assert body["code"] == "indicator_not_found"


def test_bad_params_are_422(client: TestClient) -> None:
    request = {
        "source": {"kind": "synthetic"},
        "indicators": [{"id": "rsi", "params": {"length": 0}}],
    }
    assert lab(client, request, 422)["code"] == "invalid_params"


@pytest.mark.parametrize(
    ("operand", "detail"),
    [
        ({"indicator": 1, "output": "rsi"}, "out of range"),
        ({"indicator": 0, "output": "ma"}, "has no output 'ma'"),
    ],
)
def test_bad_operands_are_invalid_lab_requests(
    client: TestClient, operand: dict[str, Any], detail: str
) -> None:
    request = {
        "source": {"kind": "synthetic"},
        "indicators": [{"id": "rsi"}],
        "conditions": [{"left": {"price": "close"}, "op": "gt", "right": operand}],
    }
    body = lab(client, request, 422)
    assert body["code"] == "invalid_lab_request"
    assert detail in body["detail"]
    assert "conditions[0].right" in body["detail"]


@pytest.mark.parametrize(
    "request_body",
    [
        {},
        {"source": {"kind": "csv"}},
        {"source": {"kind": "synthetic", "bars": 99}},
        {"source": {"kind": "synthetic", "bars": 2001}},
        {"source": {"kind": "synthetic", "seed": 1_000_001}},
        {"source": {"kind": "synthetic", "scenario": "moon"}},
        {"source": {"kind": "symbol"}},
        {"source": {"kind": "synthetic"}, "horizon": 0},
        {"source": {"kind": "synthetic"}, "horizon": 61},
        {"source": {"kind": "synthetic"}, "indicators": [{"id": "sma"}] * 5},
        {"source": {"kind": "synthetic"}, "conditions": [RSI_BELOW_30] * 4},
        {
            "source": {"kind": "synthetic"},
            "conditions": [{"left": {"value": 1}, "op": "eq", "right": {"value": 1}}],
        },
        {
            "source": {"kind": "synthetic"},
            "conditions": [
                {"left": {"value": 1, "price": "close"}, "op": "lt", "right": {"value": 1}}
            ],
        },
    ],
)
def test_malformed_requests_are_422(client: TestClient, request_body: dict[str, Any]) -> None:
    assert lab(client, request_body, 422)["code"] == "validation_error"
