"""B0 properties: the context alignment against a scalar golden model, and signals with no lookahead
(a prefix of the bars gives the prefix of the signals, context bars included)."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st

from app.analysis.synthetic import Scenario, synthetic_bars
from app.backtest.examples import EXAMPLES
from app.backtest.profiles import PROFILES, ProfileId
from app.backtest.signals import (
    SIGNAL_NAMES,
    IndicatorSource,
    align_context,
    rule_outputs,
    rule_signals,
)
from app.backtest.strategy import RulesStrategy
from app.data.resample import aggregate, period_keys, resample
from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, IntArray, Interval


def _golden_align(
    decision_days: list[int], context_days: list[int], interval: Interval
) -> list[int]:
    """Scalar model: the last context bar whose period is before the decision bar's period."""

    def key(day: int) -> int:
        if interval is Interval.D1:
            return day
        return int(period_keys(np.array([day * SECONDS_PER_DAY]), interval)[0])

    out: list[int] = []
    for d in decision_days:
        last = -1
        for j, c in enumerate(context_days):
            if key(c) < key(d):
                last = j
        out.append(last)
    return out


@settings(max_examples=60, deadline=None)
@given(
    gaps=st.lists(st.integers(min_value=1, max_value=9), min_size=1, max_size=80),
    interval=st.sampled_from([Interval.D1, Interval.W1, Interval.M1]),
)
def test_alignment_equals_the_golden_model(gaps: list[int], interval: Interval) -> None:
    days = np.cumsum([19_000, *gaps])
    frame = BarFrame.from_columns(days * SECONDS_PER_DAY, *([np.ones(len(days))] * 4))
    context = resample(frame, interval)
    got = align_context(frame, Interval.D1, context, interval)
    want = _golden_align(days.tolist(), (context.time // SECONDS_PER_DAY).tolist(), interval)
    assert got.tolist() == want


def _signals_prefix_invariant(
    strategy: RulesStrategy,
    frame: BarFrame,
    interval: Interval,
    ks: list[int],
    context_of: Callable[[BarFrame, Interval], BarFrame],
) -> None:
    """``context_of(bars, interval)`` builds the context bars from the bars that exist."""
    allowed = PROFILES[strategy.profile].context_for(interval)

    def run(f: BarFrame) -> tuple[dict[str, list[bool]], list[dict[str, FloatArray]]]:
        source = IndicatorSource(f, interval, lambda iv: context_of(f, iv), allowed)
        sig = rule_signals(strategy, source)
        return {n: getattr(sig, n).tolist() for n in SIGNAL_NAMES}, rule_outputs(
            strategy.indicators, source
        )

    full, full_values = run(frame)
    for k in ks:
        part, part_values = run(frame.take(slice(0, k)))
        for n in SIGNAL_NAMES:
            assert part[n] == full[n][:k], f"{n} changed at a prefix of {k} bars"
        for i, (p, w) in enumerate(zip(part_values, full_values, strict=True)):
            for name, values in p.items():  # the operands too, not only the booleans
                np.testing.assert_allclose(
                    values,
                    w[name][:k],
                    rtol=1e-12,
                    equal_nan=True,
                    err_msg=f"indicators[{i}].{name} at a prefix of {k}",
                )


@settings(max_examples=12, deadline=None)
@given(
    seed=st.integers(min_value=0, max_value=10_000),
    scenario=st.sampled_from(list(Scenario)),
    cuts=st.lists(st.integers(min_value=30, max_value=399), min_size=1, max_size=4),
)
def test_example_signals_have_no_lookahead(seed: int, scenario: Scenario, cuts: list[int]) -> None:
    frame = synthetic_bars(scenario, seed, 400)
    for strategy in EXAMPLES.values():
        # The weekly bars are rebuilt from the bars that exist: a cut mid-week leaves a partial
        # week, which must not reach any bar of that week.
        _signals_prefix_invariant(strategy, frame, Interval.D1, cuts, resample)


def _sessions_to_daily(frame: BarFrame, _: Interval) -> BarFrame:
    assert frame.session is not None
    daily = aggregate(frame, frame.session)
    keys: IntArray = np.unique(frame.session)
    return BarFrame.from_columns(
        keys * SECONDS_PER_DAY, daily.open, daily.high, daily.low, daily.close
    )


@settings(max_examples=10, deadline=None)
@given(
    seed=st.integers(min_value=0, max_value=10_000),
    cuts=st.lists(st.integers(min_value=10, max_value=349), min_size=1, max_size=4),
)
def test_hourly_signals_with_a_daily_context_have_no_lookahead(seed: int, cuts: list[int]) -> None:
    frame = synthetic_bars(Scenario.RANDOM_WALK, seed, 350, intraday=True)
    close = {"price": "close"}
    daily_sma, ema = {"indicator": 0, "output": "ma"}, {"indicator": 1, "output": "ma"}
    strategy = RulesStrategy.model_validate(
        {
            "profile": ProfileId.SWING,
            "indicators": [
                {"id": "sma", "params": {"length": 3}, "interval": "1D"},
                {"id": "ema", "params": {"length": 7}},
            ],
            "long": {
                "entry": [
                    [
                        {"left": close, "op": "gt", "right": daily_sma},
                        {"left": close, "op": "crosses_above", "right": ema},
                    ]
                ]
            },
            "short": {"entry": [[{"left": close, "op": "lt", "right": daily_sma}]]},
        }
    )
    _signals_prefix_invariant(strategy, frame, Interval.H1, cuts, _sessions_to_daily)
