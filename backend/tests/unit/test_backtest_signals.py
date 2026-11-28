"""B0: trader profiles, the strategy model and signals (hand vectors)."""

from __future__ import annotations

from datetime import date
from typing import Any

import numpy as np
import pytest
from pydantic import ValidationError

from app.backtest.examples import EXAMPLES
from app.backtest.profiles import PROFILES, ProfileId
from app.backtest.signals import (
    IndicatorSource,
    align_context,
    any_group,
    rule_signals,
    take_aligned,
)
from app.backtest.strategy import RulesStrategy
from app.data.resample import resample
from app.models.bars import BarFrame, Interval, date_to_ts


def _daily(days: list[date], close: list[float] | None = None) -> BarFrame:
    c = close if close is not None else [float(i + 1) for i in range(len(days))]
    return BarFrame.from_columns([date_to_ts(d) for d in days], c, c, c, c)


def _no_context(_: Interval) -> BarFrame:  # pragma: no cover - never called by these strategies
    raise AssertionError("no context interval expected")


# ---------------------------------------------------------------- profiles


def test_four_profiles_differ_by_the_period_the_cap_counts_over() -> None:
    periods = {p.id: (p.cap_period, p.default_max_trades) for p in PROFILES.values()}
    assert periods == {
        ProfileId.DAY: ("day", 10),
        ProfileId.SWING: ("week", 10),
        ProfileId.POSITION: ("month", 10),
        ProfileId.LONG_TERM: ("year", 12),
    }
    assert [p.overnight for p in PROFILES.values()] == [False, True, True, True]


def test_context_intervals_are_longer_than_the_decision_interval() -> None:
    order = list(Interval)
    for p in PROFILES.values():
        for d in p.decision_intervals:
            assert all(order.index(c) > order.index(d) for c in p.context_for(d))
    long_term = PROFILES[ProfileId.LONG_TERM]
    assert long_term.context_for(Interval.W1) == [Interval.M1]
    assert long_term.context_for(Interval.M1) == []


# ---------------------------------------------------------------- context alignment


def test_a_week_reaches_the_daily_bars_of_the_next_week() -> None:
    # Mon 2024-01-01 .. Fri 01-05, Mon 01-08 .. Thu 01-11 (Friday a holiday), Mon 01-15.
    days = [date(2024, 1, d) for d in (1, 2, 3, 4, 5, 8, 9, 10, 11, 15)]
    frame = _daily(days)
    weekly = resample(frame, Interval.W1)
    index = align_context(frame, Interval.D1, weekly, Interval.W1)
    assert index.tolist() == [-1] * 5 + [0] * 4 + [1]
    values = take_aligned(weekly.close, index)
    # The first week's close (Friday's, 5) arrives on Monday 01-08; the short week's (Thursday's,
    # 9) on Monday 01-15.
    np.testing.assert_array_equal(values, [np.nan] * 5 + [5.0] * 4 + [9.0])


def test_a_month_reaches_the_weekly_bars_of_a_later_month() -> None:
    weeks = [date(2024, 1, 1), date(2024, 1, 29), date(2024, 2, 5), date(2024, 3, 4)]
    frame = _daily(weeks)
    monthly = BarFrame.from_columns(
        [date_to_ts(date(2024, m, 1)) for m in (1, 2, 3)], [1.0, 2, 3], [1.0, 2, 3], [1.0, 2, 3],
        [1.0, 2, 3],
    )  # fmt: skip
    # The week of 01-29 starts in January (it ends in February): January is used from 02-05.
    assert align_context(frame, Interval.W1, monthly, Interval.M1).tolist() == [-1, -1, 0, 1]


def test_an_hour_reaches_the_5m_bar_that_ends_with_it() -> None:
    start = date_to_ts(date(2024, 1, 2)) + 14 * 3600 + 30 * 60  # 09:30 New York in UTC
    five = start + 300 * np.arange(15)  # 09:30 .. 10:40
    frame = BarFrame.from_columns(five, *([np.ones(15)] * 4))
    hours = BarFrame.from_columns([start, start + 3600], *([np.ones(2)] * 4))
    index = align_context(frame, Interval.MIN5, hours, Interval.H1)
    # The 09:30 hour has ended with the 10:25 bar (index 11); the 10:30 hour has not ended yet.
    assert index.tolist() == [-1] * 11 + [0] * 4


def test_a_day_reaches_the_hourly_bars_of_the_next_session() -> None:
    sessions = np.array([100, 100, 100, 101, 101, 102])
    hourly = BarFrame.from_columns(
        sessions * 86_400 + 14 * 3600 + np.arange(6), *([np.ones(6)] * 4)
    ).with_session(sessions)
    daily = BarFrame.from_columns([100 * 86_400, 101 * 86_400, 102 * 86_400], *([np.ones(3)] * 4))
    index = align_context(hourly, Interval.H1, daily, Interval.D1)
    assert index.tolist() == [-1, -1, -1, 0, 0, 1]


def test_take_aligned_without_context_bars_is_all_nan() -> None:
    assert np.isnan(take_aligned(np.empty(0), np.array([-1, -1]))).all()


# ---------------------------------------------------------------- rules


def _cond(left: dict[str, Any], op: str, right: dict[str, Any]) -> dict[str, Any]:
    return {"left": left, "op": op, "right": right}


_CLOSE = {"price": "close"}
_NO_CONDITIONS: list[dict[str, Any]] = []


def _value(x: float) -> dict[str, Any]:
    return {"value": x}


def test_groups_are_or_of_ands() -> None:
    frame = _daily([date(2024, 1, d) for d in range(1, 7)], [1.0, 5, 2, 6, 3, 7])
    s = RulesStrategy.model_validate(
        {
            "profile": "position",
            "long": {
                "entry": [
                    [_cond(_CLOSE, "gt", _value(4)), _cond(_CLOSE, "lt", _value(6))],
                    [_cond(_CLOSE, "lt", _value(2))],
                ]
            },
        }
    )
    got = any_group(s.long.entry, frame, [])
    assert got.tolist() == [True, True, False, False, False, False]
    assert not any_group([], frame, []).any()


def test_filters_gate_entries_not_exits_and_conflicts_are_kept() -> None:
    frame = _daily([date(2024, 1, d) for d in range(1, 6)], [1.0, 2, 3, 4, 5])
    s = RulesStrategy.model_validate(
        {
            "profile": "position",
            "long": {
                "entry": [[_cond(_CLOSE, "gt", _value(1))]],
                "exit": [[_cond(_CLOSE, "gt", _value(4))]],
            },
            "short": {
                "entry": [[_cond(_CLOSE, "gt", _value(2))]],
                "exit": [[_cond(_CLOSE, "lt", _value(2))]],
            },
            "filters": [[_cond(_CLOSE, "lt", _value(4))]],
        }
    )
    sig = rule_signals(s, IndicatorSource(frame, Interval.D1, _no_context, ()))
    assert sig.long_entry.tolist() == [False, True, True, False, False]
    assert sig.short_entry.tolist() == [False, False, True, False, False]
    assert sig.long_exit.tolist() == [False, False, False, False, True]  # not filtered
    assert sig.short_exit.tolist() == [True, False, False, False, False]
    assert sig.conflict.tolist() == [False, False, True, False, False]


def test_a_weekly_indicator_in_a_rule() -> None:
    days = [date(2024, 1, d) for d in (1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15)]
    frame = _daily(days, [10.0, 10, 10, 10, 10, 9, 11, 12, 8, 12, 9])
    s = RulesStrategy.model_validate(
        {
            "profile": "position",
            "indicators": [{"id": "sma", "params": {"length": 1}, "interval": "1W"}],
            "long": {"entry": [[_cond(_CLOSE, "gt", {"indicator": 0, "output": "ma"})]]},
        }
    )
    weekly = PROFILES[ProfileId.POSITION].context_intervals
    source = IndicatorSource(frame, Interval.D1, lambda iv: resample(frame, iv), weekly)
    # Week 2 compares with week 1's close (10), week 3 with week 2's (12).
    assert np.flatnonzero(rule_signals(s, source).long_entry).tolist() == [6, 7, 9]


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"long": {}}, "at least one entry group"),
        ({"indicators": [{"id": "nope"}], "long": {"entry": [[_cond(_CLOSE, "gt", _value(1))]]}},
         "Unknown indicator"),
        ({"indicators": [{"id": "sma", "params": {"length": 0}}],
          "long": {"entry": [[_cond(_CLOSE, "gt", _value(1))]]}}, "length"),
        ({"indicators": [{"id": "sma", "interval": "1h"}],
          "long": {"entry": [[_cond(_CLOSE, "gt", _value(1))]]}}, "not a context interval"),
        ({"long": {"entry": [[_cond(_CLOSE, "gt", {"indicator": 0, "output": "ma"})]]}},
         "out of range"),
        ({"indicators": [{"id": "sma"}],
          "short": {"entry": [[_cond(_CLOSE, "gt", {"indicator": 0, "output": "x"})]]}},
         "no output 'x'"),
        ({"long": {"entry": [_NO_CONDITIONS]}}, "at least 1 item"),
    ],
)  # fmt: skip
def test_invalid_rules_are_refused(body: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        RulesStrategy.model_validate({"profile": "position", **body})


def test_the_examples_are_valid_position_strategies() -> None:
    assert EXAMPLES
    for s in EXAMPLES.values():
        assert s.profile is ProfileId.POSITION
        assert s.long.entry
        assert s.short.entry
