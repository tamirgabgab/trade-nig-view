"""B1: the metrics against known series, and the profile's market arrays (cap periods, session)."""

from __future__ import annotations

import math
from datetime import date

import numpy as np
import pytest

from app.backtest.engine import Trade
from app.backtest.market import cap_periods, session_flags
from app.backtest.metrics import buy_and_hold, compute
from app.models.bars import BarFrame, Interval, date_to_ts
from app.models.symbols import SymbolInfo


def trade(pnl: float, ret: float, r: float | None = None) -> Trade:
    return Trade(1, 0, 1.0, 1, 1.0, "exit", 1, pnl, ret, r, 0.0, 0.0)


def test_a_single_drawdown() -> None:
    equity = np.array([100.0, 120, 90, 100, 130])
    m = compute(equity, [], np.zeros(5, dtype=np.bool_), years=1.0, bars_per_year=4.0)
    assert m.total_return == pytest.approx(0.3)
    assert m.net_profit == pytest.approx(30)
    assert m.cagr == pytest.approx(0.3)  # one year
    assert m.max_drawdown == pytest.approx(90 / 120 - 1)
    assert m.max_drawdown_bars == 2  # 90 and 100 are under the peak of 120
    assert m.calmar == pytest.approx(0.3 / 0.25)
    r = equity[1:] / equity[:-1] - 1
    assert m.sharpe == pytest.approx(r.mean() / r.std(ddof=1) * 2)
    assert m.sortino == pytest.approx(r.mean() / math.sqrt(np.mean(np.minimum(r, 0) ** 2)) * 2)
    assert m.volatility == pytest.approx(r.std(ddof=1) * 2)
    assert (m.trades, m.win_rate, m.profit_factor, m.expectancy, m.avg_r) == (
        0,
        None,
        None,
        None,
        None,
    )


def test_a_constant_return_has_no_sharpe_and_two_years_compound() -> None:
    equity = 100 * 1.01 ** np.arange(9, dtype=np.float64)
    m = compute(equity, [], np.ones(9, dtype=np.bool_), years=2.0, bars_per_year=4.0)
    assert m.sharpe is None  # no deviation
    assert m.sortino is None  # no losing bar
    assert m.cagr == pytest.approx(1.01**4 - 1)
    assert m.max_drawdown == 0
    assert m.calmar is None
    assert m.exposure == 1


def test_trade_statistics() -> None:
    trades = [trade(30, 0.3, 3.0), trade(-10, -0.1, -1.0), trade(-5, -0.05), trade(20, 0.2)]
    m = compute(np.array([100.0, 135]), trades, np.array([True, False]), 1.0, 1.0)
    assert m.win_rate == 0.5
    assert m.profit_factor == pytest.approx(50 / 15)
    assert m.expectancy == pytest.approx(0.0875)
    assert m.avg_r == pytest.approx(1.0)  # over the trades with a stop
    assert m.exposure == 0.5


def test_buy_and_hold_pays_both_fills() -> None:
    e = buy_and_hold(np.array([10.0, 11, 12]), np.array([10.5, 11.5, 12.0]), 1000, 0.001)
    assert e.tolist() == pytest.approx(
        [1000 - 1 + 50, 1000 - 1 + 150, 1000 - 1 + 200 - 0.001 * 1200]
    )


def _days(*days: date) -> BarFrame:
    t = [date_to_ts(d) for d in days]
    return BarFrame.from_columns(t, *([np.ones(len(t))] * 4))


def test_cap_periods() -> None:
    f = _days(
        date(2024, 1, 5), date(2024, 1, 8), date(2024, 1, 31), date(2024, 2, 1), date(2025, 1, 2)
    )
    assert len(set(cap_periods(f, Interval.D1, "day").tolist())) == 5
    week = cap_periods(f, Interval.D1, "week").tolist()
    assert week[0] != week[1]  # Friday and the next Monday
    month = cap_periods(f, Interval.D1, "month").tolist()
    assert month[1] == month[2] != month[3]
    year = cap_periods(f, Interval.D1, "year").tolist()
    assert year[:4] == [year[0]] * 4 != year[4:]


US = SymbolInfo.model_validate(
    {"symbol": "X", "display": "X", "name": "X", "type": "stock", "group": "Stocks",
     "exchange": "NASDAQ", "currency": "USD", "timezone": "America/New_York"}
)  # fmt: skip


def _fifteen(day: date, sessions: int = 1) -> BarFrame:
    """15m bars of a regular US session (09:30-16:00 = 14:30-21:00 UTC in January)."""
    times: list[int] = []
    session: list[int] = []
    for k in range(sessions):
        base = date_to_ts(day) + k * 86_400 + 14 * 3600 + 30 * 60
        times += [base + 900 * i for i in range(26)]
        session += [date_to_ts(day) // 86_400 + k] * 26
    f = BarFrame.from_columns(times, *([np.ones(len(times))] * 4))
    return f.with_session(np.asarray(session, dtype=np.int64))


def test_the_session_end_of_15m_bars() -> None:
    f = _fifteen(date(2024, 1, 3), sessions=2)  # a Wednesday and a Thursday
    end, no_entry, first = session_flags(f, Interval.MIN15, US, 15)
    assert np.flatnonzero(end).tolist() == [25, 51]  # the 15:45 bars end at 16:00
    assert np.flatnonzero(no_entry).tolist() == [24, 25, 50, 51]  # fills at 15:45 or later
    assert np.flatnonzero(first).tolist() == [26]
    fri = US.model_copy(update={"friday_hours": "09:30-13:00"})
    end_fri, _, _ = session_flags(_fifteen(date(2024, 1, 5)), Interval.MIN15, fri, 15)
    assert np.flatnonzero(end_fri).tolist()[0] == 13  # 12:45 ends at 13:00


def test_no_session_end_for_daily_bars_or_24_hour_markets() -> None:
    f = _fifteen(date(2024, 1, 3))
    fx = US.model_copy(update={"session_start": "17:00"})
    for flags in (session_flags(f, Interval.MIN15, fx, 15), session_flags(f, Interval.D1, US, 15)):
        assert not any(a.any() for a in flags)
