"""Golden models vs ``app.indicators`` for the R3c set (bands, oscillators, volatility, volume):
every bar of every golden data set, ``rtol=1e-9, atol=1e-12``."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.data.providers.fixtures import read_hourly_fixture
from app.data.sessions import session_days
from app.indicators import core
from app.indicators.atr import SMOOTHING
from app.indicators.catalog import CATALOG
from app.indicators.ma import MA_TYPES
from app.models.bars import BarFrame
from tests.golden.conftest import Row
from tests.golden.harness import REPO_ROOT, Comparison, compare, golden_frames
from tests.golden.models import (
    GOLDEN_MA,
    golden_bb,
    golden_ma_of,
    golden_macd,
    golden_obv,
    golden_rsi,
    golden_shift,
    golden_source,
    golden_stdev,
    golden_stoch,
    golden_true_range,
    golden_vwap,
)

FRAMES = golden_frames()
DATA = sorted(FRAMES)
#: Basis / signal types exercised against every data set (one of each kind: FIR, IIR, cascaded,
#: adaptive, volume-weighted).
TYPES = ("sma", "ema", "hma", "kama", "vwma", "t3")
HOURLY = {
    "e2e/AAPL": REPO_ROOT / "frontend" / "e2e" / "data" / "1h" / "AAPL.csv",
    "tests/AAA": REPO_ROOT / "backend" / "tests" / "fixtures" / "1h" / "AAA.csv",
}


def _record(
    scoreboard: list[Row], indicator: str, params: str, data: str, stats: Comparison
) -> None:
    scoreboard.append(
        {
            "check": "golden",
            "indicator": indicator,
            "params": params,
            "data": data,
            "bars_compared": stats.compared,
            "max_abs_err": stats.max_abs,
            "max_rel_err": stats.max_rel,
        }
    )


def _lists(frame: BarFrame) -> tuple[list[float], list[float], list[float], list[float]]:
    return frame.high.tolist(), frame.low.tolist(), frame.close.tolist(), frame.volume.tolist()


def hourly_frame(path: Path) -> BarFrame:
    """An hourly fixture with its New York session days, as ``BarService`` serves it."""
    frame = read_hourly_fixture(path)
    return frame.with_session(session_days(frame.time, "America/New_York"))


# --- primitives -------------------------------------------------------------------------------


@pytest.mark.parametrize("length", [1, 2, 20, 50, 200])
@pytest.mark.parametrize("data", DATA)
def test_stdev_matches_golden_model(length: int, data: str) -> None:
    close = FRAMES[data].close
    compare(core.stdev(close, length), golden_stdev(close.tolist(), length))


@pytest.mark.parametrize("data", DATA)
def test_true_range_matches_golden_model(data: str) -> None:
    h, lo, c, _v = _lists(FRAMES[data])
    frame = FRAMES[data]
    compare(core.true_range(frame.high, frame.low, frame.close), golden_true_range(h, lo, c))


@pytest.mark.parametrize("ma_type", sorted(MA_TYPES))
def test_ma_on_a_nan_prefixed_series_matches_golden_model(ma_type: str) -> None:
    """The signal / smoothing path: every type seeded on the first valid values."""
    frame = FRAMES["data/SPY"]
    _h, _lo, c, v = _lists(frame)
    rsi = CATALOG["rsi"].run(frame, {"ma_type": ma_type, "ma_length": 10})
    compare(rsi["rsi_ma"], golden_ma_of(ma_type, golden_rsi(c, 14), 10, v))


# --- Bollinger Bands ---------------------------------------------------------------------------


@pytest.mark.parametrize("ma_type", TYPES)
@pytest.mark.parametrize("data", DATA)
def test_bb_matches_golden_model(ma_type: str, data: str, scoreboard: list[Row]) -> None:
    frame = FRAMES[data]
    _h, _lo, c, v = _lists(frame)
    out = CATALOG["bb"].run(frame, {"ma_type": ma_type})
    want = golden_bb(c, v, ma_type, 20, 2.0)
    for name in ("basis", "lower"):
        compare(out[name], want[name])
    _record(scoreboard, "bb", f"{ma_type} 20, 2", data, compare(out["upper"], want["upper"]))


@pytest.mark.parametrize(("length", "mult", "offset"), [(1, 2.0, 0), (2, 0.5, 3), (50, 3.0, 7)])
def test_bb_inputs_match_golden_model(length: int, mult: float, offset: int) -> None:
    frame = FRAMES["data/NVDA"]
    x = golden_source(
        "hlc3", frame.open.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist()
    )
    params = {"length": length, "mult": mult, "offset": offset, "source": "hlc3"}
    out = CATALOG["bb"].run(frame, params)
    for name, values in golden_bb(x, frame.volume.tolist(), "sma", length, mult).items():
        compare(out[name], golden_shift(values, offset))


# --- RSI ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("length", [1, 2, 14, 50])
@pytest.mark.parametrize("data", DATA)
def test_rsi_matches_golden_model(length: int, data: str, scoreboard: list[Row]) -> None:
    frame = FRAMES[data]
    out = CATALOG["rsi"].run(frame, {"length": length})
    stats = compare(out["rsi"], golden_rsi(frame.close.tolist(), length))
    _record(scoreboard, "rsi", f"length={length}", data, stats)


@pytest.mark.parametrize("ma_type", sorted(MA_TYPES))
def test_rsi_smoothing_and_bands_match_golden_model(ma_type: str) -> None:
    frame = FRAMES["data/MSFT"]
    _h, _lo, c, v = _lists(frame)
    m = max(9, MA_TYPES[ma_type].min_length)
    params = {"ma_type": ma_type, "ma_length": m, "bb": True, "bb_mult": 1.5}
    out = CATALOG["rsi"].run(frame, params)
    rsi = golden_rsi(c, 14)
    smooth = golden_ma_of(ma_type, rsi, m, v)
    dev = golden_stdev(rsi, m)
    compare(out["rsi_ma"], smooth)
    compare(out["bb_upper"], [s + 1.5 * d for s, d in zip(smooth, dev, strict=True)])
    compare(out["bb_lower"], [s - 1.5 * d for s, d in zip(smooth, dev, strict=True)])


# --- MACD --------------------------------------------------------------------------------------


@pytest.mark.parametrize("data", DATA)
@pytest.mark.parametrize(
    ("osc", "signal"), [("ema", "ema"), ("sma", "sma"), ("ema", "sma"), ("hma", "kama")]
)
def test_macd_matches_golden_model(osc: str, signal: str, data: str, scoreboard: list[Row]) -> None:
    frame = FRAMES[data]
    _h, _lo, c, v = _lists(frame)
    out = CATALOG["macd"].run(frame, {"osc_ma_type": osc, "signal_ma_type": signal})
    want = golden_macd(c, v, 12, 26, 9, osc, signal)
    compare(out["macd"], want["macd"])
    compare(out["signal"], want["signal"])
    stats = compare(out["hist"], want["hist"])
    _record(scoreboard, "macd", f"12/26/9 {osc}/{signal}", data, stats)


@pytest.mark.parametrize("signal", sorted(MA_TYPES))
@pytest.mark.parametrize(("fast", "slow", "length"), [(5, 35, 5), (26, 12, 3), (1, 2, 1)])
def test_macd_lengths_and_signal_types_match_golden_model(
    fast: int, slow: int, length: int, signal: str
) -> None:
    frame = FRAMES["data/SPY"]
    _h, _lo, c, v = _lists(frame)
    length = max(length, MA_TYPES[signal].min_length)
    params = {
        "fast_length": fast,
        "slow_length": slow,
        "signal_length": length,
        "signal_ma_type": signal,
    }
    out = CATALOG["macd"].run(frame, params)
    want = golden_macd(c, v, fast, slow, length, "ema", signal)
    for name in ("macd", "signal", "hist"):
        compare(out[name], want[name])


# --- Stochastic --------------------------------------------------------------------------------


@pytest.mark.parametrize(("n", "sk", "sd"), [(14, 1, 3), (14, 3, 3), (5, 2, 4), (1, 1, 1)])
@pytest.mark.parametrize("data", DATA)
def test_stoch_matches_golden_model(
    n: int, sk: int, sd: int, data: str, scoreboard: list[Row]
) -> None:
    frame = FRAMES[data]
    h, lo, c, _v = _lists(frame)
    out = CATALOG["stoch"].run(frame, {"k_length": n, "k_smoothing": sk, "d_smoothing": sd})
    want = golden_stoch(h, lo, c, n, sk, sd)
    compare(out["k"], want["k"])
    _record(scoreboard, "stoch", f"{n}/{sk}/{sd}", data, compare(out["d"], want["d"]))


# --- ATR ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("smoothing", sorted(SMOOTHING))
@pytest.mark.parametrize("length", [1, 14, 50])
@pytest.mark.parametrize("data", DATA)
def test_atr_matches_golden_model(
    smoothing: str, length: int, data: str, scoreboard: list[Row]
) -> None:
    frame = FRAMES[data]
    h, lo, c, v = _lists(frame)
    out = CATALOG["atr"].run(frame, {"length": length, "ma_type": smoothing})
    want = GOLDEN_MA[SMOOTHING[smoothing]](golden_true_range(h, lo, c), length, v)
    _record(scoreboard, "atr", f"{smoothing} {length}", data, compare(out["atr"], want))


# --- OBV, VWAP, Volume SMA ---------------------------------------------------------------------


@pytest.mark.parametrize("data", DATA)
def test_obv_matches_golden_model(data: str, scoreboard: list[Row]) -> None:
    frame = FRAMES[data]
    _h, _lo, c, v = _lists(frame)
    stats = compare(CATALOG["obv"].run(frame)["obv"], golden_obv(c, v))
    _record(scoreboard, "obv", "", data, stats)


@pytest.mark.parametrize("source", ["hlc3", "close", "ohlc4"])
@pytest.mark.parametrize("data", sorted(HOURLY))
def test_vwap_matches_golden_model(source: str, data: str, scoreboard: list[Row]) -> None:
    frame = hourly_frame(HOURLY[data])
    assert frame.session is not None
    price = golden_source(
        source, frame.open.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist()
    )
    want = golden_vwap(price, frame.volume.tolist(), frame.session.tolist())
    stats = compare(CATALOG["vwap"].run(frame, {"source": source})["vwap"], want)
    _record(scoreboard, "vwap", f"source={source}", f"1h/{data}", stats)


@pytest.mark.parametrize("length", [1, 20, 50])
@pytest.mark.parametrize("data", DATA)
def test_vol_sma_matches_golden_model(length: int, data: str, scoreboard: list[Row]) -> None:
    frame = FRAMES[data]
    out = CATALOG["vol_sma"].run(frame, {"length": length})["ma"]
    stats = compare(out, GOLDEN_MA["sma"](frame.volume.tolist(), length, []))
    _record(scoreboard, "vol_sma", f"length={length}", data, stats)
