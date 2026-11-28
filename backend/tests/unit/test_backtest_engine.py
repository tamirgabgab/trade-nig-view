"""B1: directed scenarios of the backtest engine, every number computed by hand (ADR 0037)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

import numpy as np
import pytest

from app.backtest.engine import Market, Settings, run
from app.backtest.signals import Signals
from app.backtest.strategy import Exits, Level
from app.models.bars import BarFrame, date_to_ts

CAPITAL = 100_000.0


def market(
    rows: Sequence[tuple[float, float, float, float]],
    *,
    atr: float = 1.0,
    period: Sequence[int] | None = None,
    session_end: Sequence[int] = (),
    no_entry: Sequence[int] = (),
    session_open: Sequence[int] = (),
) -> Market:
    n = len(rows)
    o, h, lo, c = (list(col) for col in zip(*rows, strict=True))
    times = [date_to_ts(date(2024, 1, 1)) + 86_400 * i for i in range(n)]

    def mask(idx: Sequence[int]) -> np.ndarray:
        m = np.zeros(n, dtype=np.bool_)
        m[list(idx)] = True
        return m

    return Market(
        frame=BarFrame.from_columns(times, o, h, lo, c),
        atr=np.full(n, atr),
        period=np.zeros(n, dtype=np.int64) if period is None else np.asarray(period),
        session_end=mask(session_end),
        no_entry=mask(no_entry),
        session_open=mask(session_open),
        bars_per_year=252.0,
    )


def signals(n: int, **at: Sequence[int]) -> Signals:
    arrays = {
        k: np.zeros(n, dtype=np.bool_)
        for k in ("long_entry", "long_exit", "short_entry", "short_exit")
    }
    for name, idx in at.items():
        arrays[name][list(idx)] = True
    return Signals(**arrays)


def flat(price: float) -> tuple[float, float, float, float]:
    return (price, price, price, price)


def test_a_long_round_trip_pays_the_cost_on_both_fills() -> None:
    m = market([flat(10), (10, 11, 9, 10.5), flat(11), flat(11)])
    r = run(m, signals(4, long_entry=[0], long_exit=[1]), Exits(), 10, Settings(cost=0.001))
    (t,) = r.trades
    assert (t.side, t.entry_index, t.entry_price, t.exit_index, t.exit_price) == (1, 1, 10, 2, 11)
    assert (t.reason, t.bars) == ("exit", 1)
    want = 0.999 * 1.1 - 0.001 - 1  # (1 - c) q / p - c - 1
    assert t.ret == pytest.approx(want, rel=1e-12)
    assert r.equity.tolist() == pytest.approx(
        [
            CAPITAL,
            CAPITAL * (1 - 0.001) + CAPITAL / 10 * 0.5,
            CAPITAL * (1 + want),
            CAPITAL * (1 + want),
        ]
    )
    assert (t.mae, t.mfe) == pytest.approx((-0.1, 0.1))  # bar 1: low 9, high 11


def test_a_short_round_trip() -> None:
    m = market([flat(100), flat(100), flat(90), flat(90)])
    r = run(m, signals(4, short_entry=[0], short_exit=[1]), Exits(), 10, Settings(cost=0.002))
    (t,) = r.trades
    assert t.ret == pytest.approx(1 - 0.002 - 1.002 * 0.9, rel=1e-12)  # 1 - c - (1 + c) q / p
    assert t.side == -1


def test_a_gap_through_the_stop_fills_at_the_open() -> None:
    m = market([flat(100), flat(100), (90, 91, 88, 89), flat(89)])
    exits = Exits(stop=Level(kind="percent", value=5))
    r = run(m, signals(4, long_entry=[0]), exits, 10, Settings(cost=0))
    (t,) = r.trades
    assert (t.exit_index, t.exit_price, t.reason) == (2, 90, "stop")
    assert t.r_multiple == pytest.approx(-0.10 / 0.05)


def test_stop_and_target_in_one_bar_the_stop_fills() -> None:
    m = market([flat(100), flat(100), (100, 106, 94, 100), flat(100)])
    exits = Exits(stop=Level(kind="percent", value=5), target=Level(kind="percent", value=5))
    r = run(m, signals(4, long_entry=[0]), exits, 10, Settings(cost=0))
    assert (r.trades[0].exit_price, r.trades[0].reason) == (95, "stop")


def test_a_target_in_atr_multiples_hit_inside_a_bar() -> None:
    m = market([flat(100), flat(100), (101, 104, 99, 102), flat(102)], atr=1.0)
    exits = Exits(target=Level(kind="atr", value=3))
    r = run(m, signals(4, long_entry=[0]), exits, 10, Settings(cost=0))
    assert (r.trades[0].exit_price, r.trades[0].reason) == (103, "target")  # 100 + 3 x ATR 1


def test_the_trailing_stop_ratchets_after_each_bar() -> None:
    # Entry at 100, a 10-point trail: 90, then 95 after bar 1 (high 105), 110 after bar 2 (high
    # 120); bar 3 falls to 108: out at 110.
    m = market(
        [flat(100), (100, 105, 99, 104), (104, 120, 103, 119), (115, 116, 108, 109), flat(109)]
    )
    exits = Exits(trailing=Level(kind="percent", value=10))
    r = run(m, signals(5, long_entry=[0]), exits, 10, Settings(cost=0))
    assert (r.trades[0].exit_index, r.trades[0].exit_price, r.trades[0].reason) == (
        3,
        110,
        "trailing",
    )


def test_the_time_stop() -> None:
    m = market([flat(10)] * 6)
    exits = Exits(time_stop_bars=2)
    r = run(m, signals(6, long_entry=[0]), exits, 10, Settings(cost=0))
    (t,) = r.trades
    assert (t.entry_index, t.exit_index, t.bars, t.reason) == (1, 3, 2, "time")


def test_a_signal_on_the_last_bar_does_nothing() -> None:
    r = run(market([flat(10)] * 3), signals(3, long_entry=[2]), Exits(), 10, Settings())
    assert r.trades == []
    assert r.equity.tolist() == [CAPITAL] * 3


def test_an_open_position_closes_at_the_last_close() -> None:
    m = market([flat(10), flat(10), flat(12)])
    r = run(m, signals(3, long_entry=[0]), Exits(), 10, Settings(cost=0.001))
    (t,) = r.trades
    assert r.open_at_end
    assert (t.exit_index, t.exit_price, t.reason, t.bars) == (2, 12, "end", 2)
    assert r.equity[-1] == pytest.approx(CAPITAL * (0.999 * 1.2 - 0.001))


def test_the_trade_cap_skips_entries_and_counts_them() -> None:
    m = market([flat(10)] * 8, period=[0, 0, 0, 0, 0, 1, 1, 1])
    sig = signals(8, long_entry=[0, 2, 4], long_exit=[1, 3])
    r = run(m, sig, Exits(), 1, Settings(cost=0))
    # Entries fill at bars 1, 3 and 5: the second is in the same period as the first.
    assert [t.entry_index for t in r.trades] == [1, 5]
    assert r.decisions.skipped_by_cap == 1


def test_an_own_exit_with_an_opposite_entry_reverses() -> None:
    m = market([flat(10)] * 5)
    r = run(
        m, signals(5, long_entry=[0], long_exit=[2], short_entry=[2]), Exits(), 10, Settings(cost=0)
    )
    assert [(t.side, t.entry_index, t.reason) for t in r.trades] == [(1, 1, "exit"), (-1, 3, "end")]
    assert r.decisions.opposite == 0  # not a decision: the exit was the strategy's own


def test_a_reversal_decision_reverses_first_then_follows_the_scores() -> None:
    # Long from bar 1. Bar 1: a short entry (event 1, no history: reverse at bar 2's open).
    # Bar 2 rises 100 -> 110: holding the long would have won (H = 1). Bar 3: a long entry while
    # short (event 2): event 1's window ended, the scores say hold, so the short is kept.
    m = market([flat(100), flat(100), (100, 110, 100, 110), flat(110), flat(110), flat(110)])
    sig = signals(6, long_entry=[0, 3], short_entry=[1])
    r = run(m, sig, Exits(), 10, Settings(cost=0, decide_after=1, reversal_window=1))
    d = r.decisions
    assert (d.opposite, d.reversed, d.closed, d.held) == (2, 1, 0, 1)
    assert [(t.side, t.entry_index, t.exit_index, t.reason) for t in r.trades] == [
        (1, 1, 2, "opposite"),
        (-1, 2, 5, "end"),
    ]
    assert d.scores["hold"] > d.scores["close"] > d.scores["reverse"]


def test_on_opposite_off_ignores_the_other_side() -> None:
    m = market([flat(10)] * 5)
    r = run(
        m, signals(5, long_entry=[0], short_entry=[2]), Exits(on_opposite=False), 10, Settings()
    )
    assert [(t.side, t.reason) for t in r.trades] == [(1, "end")]


def test_a_conflict_waits_for_closed_trades_on_both_sides() -> None:
    # A winning long (10 -> 12) and a losing short (12 -> 13), then both entries at bar 6.
    rows = [flat(10), flat(10), flat(12), flat(12), flat(13), flat(13), flat(13), flat(13)]
    sig = signals(8, long_entry=[0, 6], long_exit=[1], short_entry=[2, 6], short_exit=[3])
    chosen = run(market(rows), sig, Exits(), 10, Settings(cost=0, decide_after=1))
    assert chosen.decisions.conflict_long == 1
    assert chosen.trades[-1].side == 1
    waiting = run(market(rows), sig, Exits(), 10, Settings(cost=0, decide_after=2))
    assert waiting.decisions.conflict_none == 1
    assert len(waiting.trades) == 2


def test_hindsight_decides_with_the_future() -> None:
    rows = [flat(10), flat(10), flat(8), flat(8)]
    sig = signals(4, long_entry=[0], short_entry=[0])
    r = run(market(rows), sig, Exits(), 10, Settings(cost=0, reversal_window=2), hindsight=True)
    assert r.decisions.conflict_short == 1  # the price falls from 10 to 8
    assert run(market(rows), sig, Exits(), 10, Settings(cost=0)).trades == []


def test_the_day_session_end_and_a_new_session() -> None:
    m = market(
        [flat(10), flat(11), flat(12), flat(13), flat(14)], session_end=[2], session_open=[4]
    )
    r = run(m, signals(5, long_entry=[0, 2]), Exits(), 10, Settings(cost=0))
    # Flat at bar 2's close; bar 2's signal opens at bar 3; carried into bar 4's new session.
    assert [(t.entry_index, t.exit_index, t.exit_price, t.reason) for t in r.trades] == [
        (1, 2, 12, "session"),
        (3, 4, 14, "session"),
    ]


def test_no_entry_close_to_the_session_end() -> None:
    m = market([flat(10)] * 4, no_entry=[0])
    assert run(m, signals(4, long_entry=[0]), Exits(), 10, Settings()).trades == []


def test_a_short_that_loses_everything_stops_trading() -> None:
    m = market([flat(10), flat(10), flat(25), flat(25), flat(10)])
    r = run(m, signals(5, short_entry=[0, 3]), Exits(), 10, Settings(cost=0))
    assert [t.reason for t in r.trades] == ["ruin"]
    assert r.equity[-1] == r.equity[2] <= 0
