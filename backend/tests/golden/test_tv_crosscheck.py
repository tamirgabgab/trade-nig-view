"""Manual TradingView cross-check: values the user typed from TradingView vs ChartLab.

``tv_crosscheck.json`` lists (indicator, params, date) rows; a row is checked once its
``tv_value`` is filled and the real AAPL fixture exists (``scripts/make-fixtures.ps1``).
Tolerance is TradingView's display precision.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from app.indicators.catalog import get_spec
from app.models.bars import date_to_ts
from tests.golden.harness import REPO_ROOT, read_daily_csv

SPEC_FILE = Path(__file__).with_name("tv_crosscheck.json")
DOC: dict[str, Any] = json.loads(SPEC_FILE.read_text(encoding="utf-8"))
FIXTURE = REPO_ROOT / "backend" / "fixtures" / "daily" / f"{DOC['symbol']}.csv"
CHECKS: list[dict[str, Any]] = DOC["checks"]


def test_template_rows_are_well_formed() -> None:
    for row in CHECKS:
        spec = get_spec(row["indicator"])
        assert row["output"] in {o.name for o in spec.outputs}
        date.fromisoformat(row["date"])
        assert row["tv_value"] is None or isinstance(row["tv_value"], int | float)


@pytest.mark.parametrize("row", CHECKS, ids=[f"{r['indicator']}-{r['date']}" for r in CHECKS])
def test_matches_tradingview(row: dict[str, Any]) -> None:
    if row["tv_value"] is None:
        pytest.skip("tv_value not filled in yet (see _instructions in tv_crosscheck.json)")
    if not FIXTURE.is_file():
        pytest.skip(f"no {FIXTURE.name} fixture (run scripts/make-fixtures.ps1)")
    frame = read_daily_csv(FIXTURE)
    outputs = get_spec(row["indicator"]).run(frame, row["params"])
    at = np.flatnonzero(frame.time == date_to_ts(date.fromisoformat(row["date"])))
    assert len(at) == 1, f"{row['date']} is not a trading day in the fixture"
    ours = float(outputs[row["output"]][at[0]])
    assert abs(ours - float(row["tv_value"])) <= DOC["tolerance"], (ours, row["tv_value"])
