"""B0: Python strategies (``strategies/``): loading, the contract, the lookahead check."""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

import numpy as np
import pytest

from app.analysis.synthetic import Scenario, synthetic_bars
from app.backtest.python_loader import (
    PythonStrategies,
    PythonStrategyError,
    PythonStrategyNotFoundError,
    StrategyLookaheadError,
    prefix_cuts,
    python_signals,
)
from app.backtest.signals import IndicatorSource
from app.data.resample import resample
from app.errors import DataUnavailableError
from app.indicators.registry import InvalidParamsError
from app.models.bars import BarFrame, Interval

REPO_STRATEGIES = Path(__file__).resolve().parents[3] / "strategies"

_MA = """
SPEC = {
    "description": "close vs SMA",
    "params": {"length": {"type": "int", "default": 5, "min": 2}},
}

def signals(bars, params, ind):
    ma = ind("sma", length=params["length"])["ma"]
    return {"long_entry": bars.close > ma, "short_entry": bars.close < ma}
"""


_EMPTY = "def signals(b, p, i): return {}\n"
_WEEKLY = """
def signals(bars, params, ind):
    return {"long_entry": bars.close > ind("sma", interval="1W", length=5)["ma"]}
"""


def _write(folder: Path, name: str, body: str) -> PythonStrategies:
    (folder / f"{name}.py").write_text(textwrap.dedent(body), encoding="utf-8")
    return PythonStrategies(folder)


def _source(frame: BarFrame, allowed: tuple[Interval, ...] = (Interval.W1,)) -> IndicatorSource:
    return IndicatorSource(frame, Interval.D1, lambda iv: resample(frame, iv), allowed)


@pytest.fixture
def frame() -> BarFrame:
    return synthetic_bars(Scenario.RANDOM_WALK, 7, 300)


def test_a_causal_strategy_runs(tmp_path: Path, frame: BarFrame) -> None:
    files = _write(tmp_path, "ma", _MA)
    (tmp_path / "_helper.py").write_text("X = 1\n", encoding="utf-8")
    assert files.names() == ["ma"]
    module = files.load("ma")
    assert module.description == "close vs SMA"
    assert [(p.name, p.default, p.min, p.max) for p in module.params] == [("length", 5, 2, None)]
    sig = python_signals(module, {"length": 10}, _source(frame))
    ma = np.convolve(frame.close, np.ones(10) / 10, mode="full")[: len(frame)]
    ma[:9] = np.nan
    np.testing.assert_array_equal(sig.long_entry, frame.close > ma)
    assert not sig.long_exit.any()  # a missing key never fires
    assert sig.long_entry.any()
    assert sig.short_entry.any()


def test_the_repo_example_runs_with_its_weekly_context(frame: BarFrame) -> None:
    files = PythonStrategies(REPO_STRATEGIES)
    assert "breakout_weekly_trend" in files.names()
    sig = python_signals(files.load("breakout_weekly_trend"), {"length": 20}, _source(frame))
    assert sig.long_entry.any() or sig.short_entry.any()


@pytest.mark.parametrize(
    "body",
    [
        # Bar t reads bar t + 1.
        """
        import numpy as np
        def signals(bars, params, ind):
            return {"long_entry": np.roll(bars.close, -1) > bars.close}
        """,
        # Compared with the whole history's mean.
        """
        def signals(bars, params, ind):
            return {"long_entry": bars.close > bars.close.mean()}
        """,
        # Not deterministic.
        """
        import numpy as np
        def signals(bars, params, ind):
            return {"long_entry": np.random.default_rng().random(len(bars)) > 0.5}
        """,
    ],
)
def test_reading_the_future_is_refused(tmp_path: Path, frame: BarFrame, body: str) -> None:
    files = _write(tmp_path, "cheat", body)
    with pytest.raises(StrategyLookaheadError, match="changes when later bars are added"):
        python_signals(files.load("cheat"), {}, _source(frame))


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ("def signals(:\n    pass\n", r"bad\.py line 1: SyntaxError"),
        ("x = 1\n", "define a function signals"),
        ("import nope_not_a_module\n" + _EMPTY, "line 1: ModuleNotFoundError"),
        ('SPEC = {"params": {"n": {"type": "str", "default": 1}}}\n' + _EMPTY,
         "SPEC.params.n.type"),
        ('SPEC = {"params": {"n": {"type": "int", "default": 1, "min": 2}}}\n'
         + _EMPTY, "SPEC default"),
    ],
)  # fmt: skip
def test_a_broken_file_is_reported_with_its_line(tmp_path: Path, body: str, message: str) -> None:
    files = _write(tmp_path, "bad", body)
    with pytest.raises(PythonStrategyError, match=message):
        files.load("bad")


@pytest.mark.parametrize(
    ("returns", "message"),
    [
        ("[1, 2]", "must return a dict"),
        ('{"buy": bars.close > 0}', "unknown signal"),
        ('{"long_entry": bars.close[:-1] > 0}', "expected"),
        ('{"long_entry": bars.close * float("nan")}', "NaN"),
        ('{"long_entry": bars.close.astype(str)}', "must be booleans"),
        ('{"long_entry": ind("sma", interval="1M")["ma"] > 0}', "not a context interval"),
        ('{"long_entry": 1 / 0}', r"bad\.py line 3: ZeroDivisionError"),
    ],
)
def test_a_bad_result_is_reported(
    tmp_path: Path, frame: BarFrame, returns: str, message: str
) -> None:
    files = _write(tmp_path, "bad", f"\ndef signals(bars, params, ind):\n    return {returns}\n")
    with pytest.raises(PythonStrategyError, match=message):
        python_signals(files.load("bad"), {}, _source(frame))


def test_a_dataclass_in_a_strategy_file(tmp_path: Path, frame: BarFrame) -> None:
    body = """
    from __future__ import annotations
    from dataclasses import dataclass

    @dataclass
    class Rule:
        n: int

    def signals(bars, params, ind):
        return {"long_entry": bars.close > bars.close[0] * Rule(1).n}
    """
    files = _write(tmp_path, "dc", body)
    assert python_signals(files.load("dc"), {}, _source(frame)).long_entry.any()


def test_a_data_error_is_not_the_files_fault(tmp_path: Path, frame: BarFrame) -> None:
    files = _write(tmp_path, "weekly", _WEEKLY)

    def no_bars(_: Interval) -> BarFrame:
        raise DataUnavailableError("no weekly bars")

    source = IndicatorSource(frame, Interval.D1, no_bars, (Interval.W1,))
    with pytest.raises(DataUnavailableError, match="no weekly bars"):
        python_signals(files.load("weekly"), {}, source)


def test_the_bars_are_read_only(tmp_path: Path, frame: BarFrame) -> None:
    files = _write(tmp_path, "edit", "def signals(bars, params, ind):\n    bars.close[0] = 1\n")
    with pytest.raises(PythonStrategyError, match="read-only"):
        python_signals(files.load("edit"), {}, _source(frame))
    assert frame.close.flags.writeable


def test_params_are_checked_against_the_spec(tmp_path: Path, frame: BarFrame) -> None:
    module = _write(tmp_path, "ma", _MA).load("ma")
    with pytest.raises(InvalidParamsError, match="Unknown parameter"):
        python_signals(module, {"lenght": 3}, _source(frame))
    with pytest.raises(InvalidParamsError, match=">= 2"):
        python_signals(module, {"length": 1}, _source(frame))


def test_a_changed_file_is_imported_again(tmp_path: Path) -> None:
    files = _write(tmp_path, "ma", _MA)
    assert files.load("ma") is files.load("ma")
    path = tmp_path / "ma.py"
    path.write_text(_MA.replace("close vs SMA", "edited"), encoding="utf-8")
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
    assert files.load("ma").description == "edited"


def test_missing_files(tmp_path: Path) -> None:
    files = PythonStrategies(tmp_path / "absent")
    assert files.names() == []
    with pytest.raises(PythonStrategyNotFoundError):
        files.load("nothing")
    (tmp_path / "_private.py").write_text("def signals(b, p, i): return {}\n", encoding="utf-8")
    with pytest.raises(PythonStrategyNotFoundError):
        PythonStrategies(tmp_path).load("_private")


def test_prefix_cuts() -> None:
    assert prefix_cuts(1) == []
    assert prefix_cuts(2) == [1]
    assert prefix_cuts(12) == [2, 4, 6, 8, 10, 11]
