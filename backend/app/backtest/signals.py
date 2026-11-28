r"""Entry and exit signals of a strategy, per bar of the decision interval, causal.

**Context intervals.** An indicator on a longer interval (the weekly SMA of a daily strategy) is
computed on that interval's bars and reaches decision bar :math:`t` only once its bar has closed:

* daily, weekly or monthly context: context bar :math:`j` is used from the first decision bar of a
  **later** period, :math:`\text{key}(j) < \text{key}(t)`, where the key is the day, the ISO week or
  the month of a bar's (session) date. The value of a week therefore arrives on the next week's
  first bar, never on the week's own last bar (which bar closes a week is only known once the next
  one exists: a holiday Friday moves it);
* intraday context (1h for 5m decisions): context bar :math:`j` is used once it has ended,
  :math:`s_j + L_c \le s_t + L_d` (bar starts :math:`s`, lengths :math:`L`).

Each decision bar takes the last such context bar, so its value depends only on bars that closed
no later than bar :math:`t` (no lookahead), and adding later bars never changes it.

**Signals.** ``rules`` strategies: see ``app.backtest.strategy``. A ``conflict`` is a bar where
both entries fire. Both are kept here: the engine (B1) settles a conflict by the side whose
*closed* trades so far earned the higher net annualised return, and takes neither side while it
cannot tell (the user, 2026-11-28).
"""

from __future__ import annotations

import copy
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from app.analysis.conditions import BoolArray, Condition, evaluate
from app.data.resample import period_keys
from app.indicators.catalog import get_spec
from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, IntArray, Interval

from .strategy import RulesStrategy, StrategyIndicator

#: The bars of a context interval (the whole history the decision bars need, or more).
ContextBars = Callable[[Interval], BarFrame]
Outputs = dict[str, FloatArray]


@dataclass(frozen=True, slots=True, eq=False)
class Signals:
    long_entry: BoolArray
    long_exit: BoolArray
    short_entry: BoolArray
    short_exit: BoolArray

    @property
    def conflict(self) -> BoolArray:
        return self.long_entry & self.short_entry


SIGNAL_NAMES = ("long_entry", "long_exit", "short_entry", "short_exit")


def _days(frame: BarFrame, interval: Interval) -> IntArray:
    """Day number of each bar's date (its session's for intraday bars)."""
    if interval.is_intraday and frame.session is not None:
        return frame.session
    return frame.time // SECONDS_PER_DAY


def _period(days: IntArray, interval: Interval) -> IntArray:
    if interval is Interval.D1:
        return days
    return period_keys(days * SECONDS_PER_DAY, interval)


def align_context(
    decision: BarFrame, decision_interval: Interval, context: BarFrame, context_interval: Interval
) -> IntArray:
    """For each decision bar, the index of the last context bar closed by then (-1: none)."""
    if context_interval.is_intraday:
        ends = context.time + context_interval.seconds
        now = decision.time + decision_interval.seconds
        return np.searchsorted(ends, now, side="right").astype(np.int64) - 1
    ctx = _period(context.time // SECONDS_PER_DAY, context_interval)
    now = _period(_days(decision, decision_interval), context_interval)
    return np.searchsorted(ctx, now, side="left").astype(np.int64) - 1


def take_aligned(values: FloatArray, index: IntArray) -> FloatArray:
    """``values[index]``, NaN where ``index`` is -1."""
    if len(values) == 0:
        return np.full(len(index), np.nan)
    out = values[np.maximum(index, 0)]
    return np.where(index >= 0, out, np.nan)


class IndicatorSource:
    """Indicator outputs on the decision bars, computing context intervals on their own bars."""

    def __init__(
        self, frame: BarFrame, interval: Interval, context: ContextBars, allowed: Sequence[Interval]
    ) -> None:
        self.frame = frame
        self.interval = interval
        self._context = context
        self._allowed = tuple(allowed)
        # Context bars and their outputs do not depend on the decision bars: shared by prefixes.
        self._bars: dict[Interval, BarFrame] = {}
        self._outputs: dict[tuple[Interval, str, str], Outputs] = {}

    def prefix(self, n: int) -> IndicatorSource:
        """The same source on the first ``n`` decision bars (sharing the context caches)."""
        out = copy.copy(self)  # shallow: the caches are shared
        out.frame = self.frame.take(slice(0, n))
        return out

    def __call__(
        self, indicator_id: str, interval: Interval | None, params: Mapping[str, object]
    ) -> Outputs:
        spec = get_spec(indicator_id)
        if interval is None or interval is self.interval:
            return spec.run(self.frame, params)
        if interval not in self._allowed:
            allowed = ", ".join(self._allowed) or "none"
            raise ValueError(f"{interval} is not a context interval here (allowed: {allowed})")
        if interval not in self._bars:
            self._bars[interval] = self._context(interval)
        bars = self._bars[interval]
        key = (interval, indicator_id, repr(sorted(params.items())))
        if key not in self._outputs:
            self._outputs[key] = spec.run(bars, params)
        index = align_context(self.frame, self.interval, bars, interval)
        return {name: take_aligned(v, index) for name, v in self._outputs[key].items()}


def any_group(
    groups: Sequence[Sequence[Condition]], frame: BarFrame, outputs: Sequence[Outputs]
) -> BoolArray:
    """OR over groups of the AND of each group's conditions (all false without groups)."""
    out = np.zeros(len(frame), dtype=np.bool_)
    for group in groups:
        out |= evaluate(group, frame, outputs)
    return out


def rule_outputs(indicators: Sequence[StrategyIndicator], source: IndicatorSource) -> list[Outputs]:
    return [source(ind.id, ind.interval, ind.params) for ind in indicators]


def rule_signals(strategy: RulesStrategy, source: IndicatorSource) -> Signals:
    """The four signals of a rules strategy on ``source.frame``."""
    frame = source.frame
    outputs = rule_outputs(strategy.indicators, source)
    gate = (
        any_group(strategy.filters, frame, outputs)
        if strategy.filters
        else np.ones(len(frame), dtype=np.bool_)
    )
    return Signals(
        long_entry=any_group(strategy.long.entry, frame, outputs) & gate,
        long_exit=any_group(strategy.long.exit, frame, outputs),
        short_entry=any_group(strategy.short.entry, frame, outputs) & gate,
        short_exit=any_group(strategy.short.exit, frame, outputs),
    )
