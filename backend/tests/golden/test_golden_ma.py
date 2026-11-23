"""Golden model vs ``app.indicators`` on every bar of every golden data set."""

from __future__ import annotations

import pytest

from app.indicators.catalog import CATALOG
from app.indicators.core import SOURCES, source
from tests.golden.conftest import Row
from tests.golden.harness import compare, golden_frames
from tests.golden.models import GOLDEN_MA, golden_shift, golden_source

FRAMES = golden_frames()
LENGTHS = (1, 2, 9, 20, 50, 200)


@pytest.mark.parametrize("indicator", sorted(GOLDEN_MA))
@pytest.mark.parametrize("length", LENGTHS)
@pytest.mark.parametrize("data", sorted(FRAMES))
def test_ma_matches_golden_model(
    indicator: str, length: int, data: str, scoreboard: list[Row]
) -> None:
    frame = FRAMES[data]
    actual = CATALOG[indicator].run(frame, {"length": length})["ma"]
    stats = compare(actual, GOLDEN_MA[indicator](frame.close.tolist(), length))
    scoreboard.append(
        {
            "check": "golden",
            "indicator": indicator,
            "params": f"length={length}",
            "data": data,
            "bars_compared": stats.compared,
            "max_abs_err": stats.max_abs,
            "max_rel_err": stats.max_rel,
        }
    )


@pytest.mark.parametrize("name", SOURCES)
def test_sources_match_golden_model(name: str) -> None:
    frame = FRAMES["data/AAPL"]
    expected = golden_source(
        name, frame.open.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist()
    )
    compare(source(frame, name), expected)


@pytest.mark.parametrize("indicator", sorted(GOLDEN_MA))
def test_source_and_offset_match_golden_model(indicator: str) -> None:
    frame = FRAMES["data/NVDA"]
    params = {"length": 14, "source": "hlc3", "offset": 3}
    actual = CATALOG[indicator].run(frame, params)["ma"]
    x = golden_source(
        "hlc3", frame.open.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist()
    )
    compare(actual, golden_shift(GOLDEN_MA[indicator](x, 14), 3))
