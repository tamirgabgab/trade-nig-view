"""Shared verification helpers: golden data sets, NaN-aware comparison, no-lookahead check."""

from __future__ import annotations

import csv
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

from app.indicators.registry import IndicatorSpec
from app.models.bars import BarFrame, FloatArray, date_to_ts

REPO_ROOT = Path(__file__).resolve().parents[3]
#: Data sets the golden tests run on: synthetic e2e series (always present) and, once the user
#: has run make-fixtures.ps1, the real Yahoo fixtures.
GOLDEN_DIRS = (
    REPO_ROOT / "frontend" / "e2e" / "data" / "daily",
    REPO_ROOT / "backend" / "fixtures" / "daily",
)
RTOL = 1e-9
ATOL = 1e-12


def read_daily_csv(path: Path) -> BarFrame:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    return BarFrame.from_columns(
        time=[date_to_ts(date.fromisoformat(r["date"])) for r in rows],
        open=[float(r["open"]) for r in rows],
        high=[float(r["high"]) for r in rows],
        low=[float(r["low"]) for r in rows],
        close=[float(r["close"]) for r in rows],
        adj_close=[float(r["adj_close"]) for r in rows],
        volume=[float(r["volume"]) for r in rows],
    )


def golden_frames() -> dict[str, BarFrame]:
    """Every daily CSV found in ``GOLDEN_DIRS``, keyed ``<dir>/<file stem>``."""
    frames: dict[str, BarFrame] = {}
    for directory in GOLDEN_DIRS:
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.csv")):
            frames[f"{directory.parent.name}/{path.stem}"] = read_daily_csv(path)
    return frames


@dataclass(frozen=True, slots=True)
class Comparison:
    max_abs: float
    max_rel: float
    compared: int


def compare(actual: FloatArray, expected: Iterable[float]) -> Comparison:
    """Assert ``actual`` equals ``expected`` on every bar: same NaN positions, values within
    ``rtol=1e-9, atol=1e-12``. Returns the error statistics for the scoreboard."""
    want = np.asarray(list(expected), dtype=np.float64)
    assert actual.shape == want.shape
    np.testing.assert_array_equal(np.isnan(actual), np.isnan(want), err_msg="NaN positions differ")
    np.testing.assert_allclose(actual, want, rtol=RTOL, atol=ATOL, equal_nan=True)
    valid = ~np.isnan(want)
    if not valid.any():
        return Comparison(0.0, 0.0, 0)
    diff = np.abs(actual[valid] - want[valid])
    scale = np.maximum(np.abs(want[valid]), 1e-300)
    return Comparison(float(diff.max()), float((diff / scale).max()), int(valid.sum()))


def check_no_lookahead(
    spec: IndicatorSpec,
    frame: BarFrame,
    params: Mapping[str, object],
    ks: Iterable[int],
) -> None:
    """``compute(bars)[k] == compute(bars[:k+1])[k]`` for every output and every ``k``.

    The replay (R7) guarantee: a value never changes when later bars arrive.
    """
    full = spec.run(frame, params)
    for k in ks:
        prefix = spec.run(frame.take(slice(0, k + 1)), params)
        for name, values in full.items():
            np.testing.assert_allclose(
                prefix[name][k],
                values[k],
                rtol=1e-12,
                atol=1e-12,
                equal_nan=True,
                err_msg=f"{spec.id}.{name} at bar {k} changed when later bars were added",
            )
