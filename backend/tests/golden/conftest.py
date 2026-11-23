"""Scoreboard: every golden comparison adds a row; the CSV lands in ``backend/.reports/``."""

from __future__ import annotations

import csv
from collections.abc import Iterator
from pathlib import Path

import pytest

REPORT = Path(__file__).resolve().parents[2] / ".reports" / "indicator_scoreboard.csv"
FIELDS: list[str] = [
    "check",
    "indicator",
    "params",
    "data",
    "bars_compared",
    "max_abs_err",
    "max_rel_err",
]

Row = dict[str, str | int | float]


@pytest.fixture(scope="session")
def scoreboard() -> Iterator[list[Row]]:
    rows: list[Row] = []
    yield rows
    if rows:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        with REPORT.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
