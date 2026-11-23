"""Golden model vs ``app.indicators`` on every bar of every golden data set."""

from __future__ import annotations

import pytest

from app.indicators.catalog import CATALOG
from app.indicators.core import SOURCES, source
from app.indicators.ma import MA_TYPES
from app.models.bars import BarFrame
from tests.golden.conftest import Row
from tests.golden.harness import compare, golden_frames
from tests.golden.models import (
    GOLDEN_MA,
    golden_alma,
    golden_crosses,
    golden_kama,
    golden_lsma,
    golden_shift,
    golden_source,
    golden_t3,
)

FRAMES = golden_frames()
LENGTHS = (1, 2, 9, 20, 50, 200)
SINGLE_MA_IDS = sorted(GOLDEN_MA)


def _cases() -> list[tuple[str, int, str]]:
    cases: list[tuple[str, int, str]] = []
    for indicator in SINGLE_MA_IDS:
        for length in LENGTHS:
            if length < MA_TYPES[indicator].min_length:
                continue
            if indicator == "swma" and length != LENGTHS[0]:
                continue  # fixed window: length is not an input
            cases.extend((indicator, length, data) for data in sorted(FRAMES))
    return cases


def _expected(indicator: str, frame: BarFrame, x: list[float], length: int) -> list[float]:
    return GOLDEN_MA[indicator](x, length, frame.volume.tolist())


@pytest.mark.parametrize(("indicator", "length", "data"), _cases())
def test_ma_matches_golden_model(
    indicator: str, length: int, data: str, scoreboard: list[Row]
) -> None:
    frame = FRAMES[data]
    params = {} if indicator == "swma" else {"length": length}
    actual = CATALOG[indicator].run(frame, params)["ma"]
    stats = compare(actual, _expected(indicator, frame, frame.close.tolist(), length))
    scoreboard.append(
        {
            "check": "golden",
            "indicator": indicator,
            "params": "" if indicator == "swma" else f"length={length}",
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


def _hlc3(frame: BarFrame) -> list[float]:
    return golden_source(
        "hlc3", frame.open.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist()
    )


@pytest.mark.parametrize("indicator", [i for i in SINGLE_MA_IDS if i != "lsma"])
def test_source_and_offset_match_golden_model(indicator: str) -> None:
    frame = FRAMES["data/NVDA"]
    spec = CATALOG[indicator]
    names = {p.name for p in spec.params}
    params = {k: v for k, v in {"length": 14, "source": "hlc3", "offset": 3}.items() if k in names}
    actual = spec.run(frame, params)["ma"]
    expected = _expected(indicator, frame, _hlc3(frame), 14)
    if "offset" in names:
        expected = golden_shift(expected, 3)
    compare(actual, expected)


@pytest.mark.parametrize(
    ("length", "offset"), [(1, 0), (2, 1), (25, 0), (25, 3), (25, 24), (40, 60)]
)
def test_lsma_offset_matches_golden_model(length: int, offset: int) -> None:
    frame = FRAMES["data/MSFT"]
    actual = CATALOG["lsma"].run(frame, {"length": length, "offset": offset})["ma"]
    compare(actual, golden_lsma(frame.close.tolist(), length, offset))


@pytest.mark.parametrize(
    ("length", "offset", "sigma", "floor"),
    [(9, 0.85, 6.0, False), (9, 0.85, 6.0, True), (20, 0.0, 3.0, False), (50, 1.0, 10.0, True)],
)
def test_alma_inputs_match_golden_model(
    length: int, offset: float, sigma: float, floor: bool
) -> None:
    frame = FRAMES["data/SPY"]
    params = {"length": length, "alma_offset": offset, "sigma": sigma, "floor": floor}
    actual = CATALOG["alma"].run(frame, params)["ma"]
    compare(actual, golden_alma(frame.close.tolist(), length, offset, sigma, floor))


@pytest.mark.parametrize(("length", "fast", "slow"), [(10, 2, 30), (5, 3, 10), (30, 1, 200)])
def test_kama_inputs_match_golden_model(length: int, fast: int, slow: int) -> None:
    frame = FRAMES["data/SPY"]
    actual = CATALOG["kama"].run(frame, {"length": length, "fast": fast, "slow": slow})["ma"]
    compare(actual, golden_kama(frame.close.tolist(), length, fast, slow))


@pytest.mark.parametrize(("length", "factor"), [(5, 0.7), (5, 0.0), (10, 1.0), (3, 0.35)])
def test_t3_factor_matches_golden_model(length: int, factor: float) -> None:
    frame = FRAMES["data/SPY"]
    actual = CATALOG["t3"].run(frame, {"length": length, "factor": factor})["ma"]
    compare(actual, golden_t3(frame.close.tolist(), length, factor))


@pytest.mark.parametrize("ma_type", sorted(MA_TYPES))
def test_generic_ma_matches_golden_model(ma_type: str) -> None:
    frame = FRAMES["data/SPY"]
    length = max(14, MA_TYPES[ma_type].min_length)
    actual = CATALOG["ma"].run(frame, {"ma_type": ma_type, "length": length, "offset": 2})["ma"]
    compare(actual, golden_shift(_expected(ma_type, frame, frame.close.tolist(), length), 2))


COMPOSITE_TYPES = ("sma", "ema", "hma", "kama", "vwma", "t3")


@pytest.mark.parametrize("fast_type", COMPOSITE_TYPES)
@pytest.mark.parametrize("data", sorted(FRAMES))
def test_ma_cross_matches_golden_model(fast_type: str, data: str, scoreboard: list[Row]) -> None:
    frame = FRAMES[data]
    params = {"fast_type": fast_type, "fast_length": 9, "slow_type": "ema", "slow_length": 21}
    out = CATALOG["ma_cross"].run(frame, params)
    x, v = frame.close.tolist(), frame.volume.tolist()
    fast = GOLDEN_MA[fast_type](x, 9, v)
    slow = GOLDEN_MA["ema"](x, 21, v)
    compare(out["fast"], fast)
    compare(out["slow"], slow)
    stats = compare(out["crosses"], golden_crosses(fast, slow))
    scoreboard.append(
        {
            "check": "golden",
            "indicator": "ma_cross",
            "params": f"{fast_type} 9 / ema 21",
            "data": data,
            "bars_compared": stats.compared,
            "max_abs_err": stats.max_abs,
            "max_rel_err": stats.max_rel,
        }
    )


@pytest.mark.parametrize("ma_type", COMPOSITE_TYPES)
def test_ma_ribbon_matches_golden_model(ma_type: str) -> None:
    frame = FRAMES["data/AAPL"]
    lengths = (5, 20, 50, 100)
    params = {"ma_type": ma_type, **{f"length_{i}": n for i, n in enumerate(lengths, start=1)}}
    out = CATALOG["ma_ribbon"].run(frame, params)
    x, v = frame.close.tolist(), frame.volume.tolist()
    for i, n in enumerate(lengths, start=1):
        compare(out[f"ma_{i}"], GOLDEN_MA[ma_type](x, n, v))


@pytest.mark.parametrize("ma_type", COMPOSITE_TYPES)
@pytest.mark.parametrize("percent", [0.0, 2.5, 10.0])
def test_envelope_matches_golden_model(ma_type: str, percent: float) -> None:
    frame = FRAMES["data/MSFT"]
    out = CATALOG["envelope"].run(frame, {"length": 20, "percent": percent, "ma_type": ma_type})
    basis = GOLDEN_MA[ma_type](frame.close.tolist(), 20, frame.volume.tolist())
    compare(out["basis"], basis)
    compare(out["upper"], [b * (1 + percent / 100) for b in basis])
    compare(out["lower"], [b * (1 - percent / 100) for b in basis])
