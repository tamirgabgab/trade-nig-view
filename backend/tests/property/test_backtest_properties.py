"""B1 properties of the engine: no lookahead, compounding, determinism, a strategy that never
trades (ADR 0037)."""

from __future__ import annotations

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st

from app.backtest.engine import Market, Run, Settings, run
from app.backtest.signals import Signals
from tests.golden.test_backtest_golden import cases


def _prefix(case: dict[str, object], k: int) -> dict[str, object]:
    m = case["market"]
    s = case["signals"]
    assert isinstance(m, Market)
    assert isinstance(s, Signals)
    cut = Market(
        frame=m.frame.take(slice(0, k)),
        atr=m.atr[:k],
        period=m.period[:k],
        session_end=m.session_end[:k],
        no_entry=m.no_entry[:k],
        session_open=m.session_open[:k],
        bars_per_year=m.bars_per_year,
    )
    sig = Signals(s.long_entry[:k], s.long_exit[:k], s.short_entry[:k], s.short_exit[:k])
    return {**case, "market": cut, "signals": sig, "hindsight": False}


@settings(max_examples=150, deadline=None)
@given(case=cases(), cut=st.floats(0.3, 0.95))
def test_a_run_to_a_bar_is_the_prefix_of_the_full_run(case: dict[str, object], cut: float) -> None:
    """Bars after k change nothing before k (the last bar of a cut run closes what is open)."""
    full = run(**{**case, "hindsight": False})  # type: ignore[arg-type]
    m = case["market"]
    assert isinstance(m, Market)
    k = int(len(m.frame) * cut)
    start = int(case["start"])  # type: ignore[call-overload]
    if k <= start + 2:
        return
    part = run(**_prefix(case, k))  # type: ignore[arg-type]
    upto = k - 1 - start  # bars before the cut run's last bar
    np.testing.assert_array_equal(part.equity[:upto], full.equity[:upto])
    closed = [t for t in full.trades if t.exit_index < k - 1]
    assert part.trades[: len(closed)] == closed


def _compounded(r: Run, capital: float) -> float:
    return capital * float(np.prod([1 + t.ret for t in r.trades]))


@settings(max_examples=150, deadline=None)
@given(case=cases())
def test_the_final_equity_compounds_the_trades(case: dict[str, object]) -> None:
    """All in or all out: the equity between trades is cash, so it is the product of the trades."""
    r = run(**case)  # type: ignore[arg-type]
    s = case["settings"]
    assert isinstance(s, Settings)
    if any(t.reason == "ruin" for t in r.trades):
        return
    np.testing.assert_allclose(r.equity[-1], _compounded(r, s.capital), rtol=1e-9)
    again = run(**case)  # type: ignore[arg-type]
    np.testing.assert_array_equal(again.equity, r.equity)
    assert again.trades == r.trades


@settings(max_examples=30, deadline=None)
@given(case=cases())
def test_a_strategy_that_never_trades_keeps_its_cash(case: dict[str, object]) -> None:
    m = case["market"]
    assert isinstance(m, Market)
    n = len(m.frame)
    none = Signals(*(np.zeros(n, dtype=np.bool_) for _ in range(4)))
    r = run(**{**case, "signals": none})  # type: ignore[arg-type]
    s = case["settings"]
    assert isinstance(s, Settings)
    assert r.trades == []
    assert (r.equity == s.capital).all()
    assert not r.in_market.any()
