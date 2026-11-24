r"""Signal conditions for the learn lab: compare indicator outputs, prices and constants per bar.

An operand is a series :math:`a_t`: an indicator output, a price column, or a constant; with
``ago = k`` it is that series :math:`k` bars earlier, :math:`a_{t-k}` (NaN for :math:`t < k`), e.g.
"OBV above its value 20 bars ago". A condition
``left op right`` is true at bar :math:`t` when

* ``lt``: :math:`a_t < b_t`; ``gt``: :math:`a_t > b_t`;
* ``crosses_above``: :math:`a_t > b_t \wedge a_{t-1} \le b_{t-1}`;
* ``crosses_below``: :math:`a_t < b_t \wedge a_{t-1} \ge b_{t-1}`

(crosses are false at :math:`t = 0`). A NaN in any value a condition reads at bar :math:`t`
(warm-up) makes it false there. The signal is the AND of all conditions (all true when there are
none). Bar :math:`t` reads only bars :math:`t - 1` and :math:`t`, so given causal indicator outputs
the signal has no lookahead.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal, Self

import numpy as np
import numpy.typing as npt
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.bars import BarFrame, FloatArray

BoolArray = npt.NDArray[np.bool_]
PriceField = Literal["open", "high", "low", "close"]
Op = Literal["lt", "gt", "crosses_above", "crosses_below"]


class Operand(BaseModel):
    """Exactly one of ``{indicator, output}``, ``{price}`` or ``{value}``."""

    model_config = ConfigDict(extra="forbid")

    indicator: int | None = Field(
        default=None, ge=0, description="Index into the request's `indicators` list"
    )
    output: str | None = Field(default=None, description="Output name of that indicator")
    price: PriceField | None = None
    value: float | None = Field(default=None, allow_inf_nan=False)
    ago: int = Field(default=0, ge=0, le=500, description="Bars back (the series k bars earlier)")

    @model_validator(mode="after")
    def _one_kind(self) -> Self:
        series = self.indicator is not None or self.output is not None
        if series and (self.indicator is None or self.output is None):
            raise ValueError("an indicator operand needs both `indicator` and `output`")
        if sum((series, self.price is not None, self.value is not None)) != 1:
            raise ValueError("give exactly one of {indicator, output}, {price} or {value}")
        return self


class Condition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    left: Operand
    op: Op
    right: Operand


def operand_series(
    operand: Operand, frame: BarFrame, outputs: Sequence[Mapping[str, FloatArray]]
) -> FloatArray:
    """The per-bar values of ``operand`` (``outputs[i]`` = the outputs of indicator ``i``)."""
    if operand.value is not None:
        return np.full(len(frame), operand.value)
    if operand.price is not None:
        series: FloatArray = getattr(frame, operand.price)
    else:
        assert operand.indicator is not None  # noqa: S101 - guaranteed by Operand's validator
        assert operand.output is not None  # noqa: S101
        series = outputs[operand.indicator][operand.output]
    if operand.ago == 0:
        return series
    k = min(operand.ago, len(series))
    return np.concatenate((np.full(k, np.nan), series[: len(series) - k]))


def _condition(a: FloatArray, op: Op, b: FloatArray) -> BoolArray:
    ok = np.isfinite(a) & np.isfinite(b)
    if op == "lt":
        return ok & (a < b)
    if op == "gt":
        return ok & (a > b)
    prev_ok = np.concatenate(([False], ok[:-1]))
    a_prev = np.concatenate(([np.nan], a[:-1]))
    b_prev = np.concatenate(([np.nan], b[:-1]))
    if op == "crosses_above":
        return ok & prev_ok & (a > b) & (a_prev <= b_prev)
    return ok & prev_ok & (a < b) & (a_prev >= b_prev)


def evaluate(
    conditions: Sequence[Condition],
    frame: BarFrame,
    outputs: Sequence[Mapping[str, FloatArray]],
) -> BoolArray:
    """AND of every condition, one bool per bar of ``frame``."""
    signal = np.ones(len(frame), dtype=np.bool_)
    for c in conditions:
        left = operand_series(c.left, frame, outputs)
        right = operand_series(c.right, frame, outputs)
        signal &= _condition(left, c.op, right)
    return signal
