"""Lab conditions: operand validation, hand vectors for every operator (NaN, crosses at t = 0,
touching), AND of several conditions, and no lookahead on random bars."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from app.analysis.conditions import Condition, Op, Operand, evaluate
from app.analysis.synthetic import Scenario, synthetic_bars
from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame, FloatArray

NAN = float("nan")


def frame_of(close: list[float]) -> BarFrame:
    return BarFrame.from_columns(
        time=[86_400 * i for i in range(len(close))],
        open=close,
        high=[c + 1 for c in close],
        low=[c - 1 for c in close],
        close=close,
    )


def cond(left: dict[str, Any], op: Op, right: dict[str, Any]) -> Condition:
    return Condition.model_validate({"left": left, "op": op, "right": right})


def run(a: list[float], op: Op, b: list[float]) -> list[bool]:
    """``a op b`` with ``a`` and ``b`` as the outputs of indicator 0."""
    outputs: list[dict[str, FloatArray]] = [{"a": np.array(a), "b": np.array(b)}]
    c = cond({"indicator": 0, "output": "a"}, op, {"indicator": 0, "output": "b"})
    return evaluate([c], frame_of([1.0] * len(a)), outputs).tolist()


@pytest.mark.parametrize(
    "operand",
    [
        {"indicator": 0, "output": "ma"},
        {"price": "close"},
        {"value": 30},
    ],
)
def test_valid_operands(operand: dict[str, Any]) -> None:
    Operand.model_validate(operand)


@pytest.mark.parametrize(
    "operand",
    [
        {},
        {"indicator": 0},
        {"output": "ma"},
        {"price": "close", "value": 1},
        {"indicator": 0, "output": "ma", "price": "open"},
        {"price": "volume"},
        {"value": 1, "extra": 2},
        {"indicator": -1, "output": "ma"},
    ],
)
def test_invalid_operands(operand: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        Operand.model_validate(operand)


def test_lt_gt_with_nan() -> None:
    a = [1.0, 2.0, NAN, 4.0, 3.0]
    b = [2.0, 2.0, 2.0, NAN, 1.0]
    assert run(a, "lt", b) == [True, False, False, False, False]
    assert run(a, "gt", b) == [False, False, False, False, True]


def test_crosses_above_and_below() -> None:
    a = [1.0, 3.0, 3.0, 2.0, 1.0, 2.0, 3.0]
    b = [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0]
    # t=0 never; t=1 up from below; t=5 touches (2 <= 2) -> t=6 crosses from touching
    assert run(a, "crosses_above", b) == [False, True, False, False, False, False, True]
    # t=3 touches from above (not below); t=4 crosses from touching
    assert run(a, "crosses_below", b) == [False, False, False, False, True, False, False]


def test_crosses_need_both_bars_defined() -> None:
    a = [1.0, NAN, 3.0, 1.0, 3.0]
    b = [2.0, 2.0, 2.0, 2.0, NAN]
    assert run(a, "crosses_above", b) == [False, False, False, False, False]
    assert run([3.0, 1.0], "crosses_above", [2.0, 2.0]) == [False, False]
    assert run([1.0, 3.0], "crosses_above", [2.0, 2.0]) == [False, True]


def test_prices_values_and_and() -> None:
    f = frame_of([10.0, 12.0, 14.0, 11.0])
    above_11 = cond({"price": "close"}, "gt", {"value": 11})
    below_high = cond({"price": "close"}, "lt", {"price": "high"})
    under_13 = cond({"price": "low"}, "lt", {"value": 12.5})
    assert evaluate([above_11], f, []).tolist() == [False, True, True, False]
    assert evaluate([above_11, below_high], f, []).tolist() == [False, True, True, False]
    assert evaluate([above_11, under_13], f, []).tolist() == [False, True, False, False]
    assert evaluate([], f, []).tolist() == [True] * 4


@settings(max_examples=40, deadline=None)
@given(
    seed=st.integers(0, 10_000),
    scenario=st.sampled_from(list(Scenario)),
    op=st.sampled_from(["lt", "gt", "crosses_above", "crosses_below"]),
    length=st.integers(2, 30),
    k=st.integers(0, 149),
)
def test_signal_has_no_lookahead(
    seed: int, scenario: Scenario, op: Op, length: int, k: int
) -> None:
    """The signal at bar k is the same on bars[:k+1] as on the full history."""
    frame = synthetic_bars(scenario, seed, 150)
    specs = [CATALOG["ema"], CATALOG["rsi"]]
    params = [{"length": length}, {"length": length}]
    conditions = [
        cond({"price": "close"}, op, {"indicator": 0, "output": "ma"}),
        cond({"indicator": 1, "output": "rsi"}, "gt", {"value": 20}),
    ]

    def signal(f: BarFrame) -> list[bool]:
        outputs = [s.run(f, p) for s, p in zip(specs, params, strict=True)]
        return evaluate(conditions, f, outputs).tolist()

    assert signal(frame.take(slice(0, k + 1)))[k] == signal(frame)[k]
