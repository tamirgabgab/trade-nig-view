"""The engine against its golden model (ADR 0037): every bar of the equity, every trade, every
decision count, on random signals, exits, costs, caps, session flags and both decision modes."""

from __future__ import annotations

from dataclasses import asdict

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st

from app.analysis.synthetic import Scenario, synthetic_bars
from app.backtest.engine import Market, Settings, run
from app.backtest.market import cap_periods
from app.backtest.signals import Signals
from app.backtest.strategy import Exits, Level
from app.indicators.catalog import get_spec
from app.models.bars import Interval
from tests.golden.backtest_model import golden_run

RTOL, ATOL = 1e-9, 1e-12

levels = st.one_of(
    st.none(),
    st.builds(Level, kind=st.just("percent"), value=st.floats(0.5, 15)),
    st.builds(Level, kind=st.just("atr"), value=st.floats(0.5, 5)),
)


@st.composite
def cases(draw: st.DrawFn) -> dict[str, object]:
    n = draw(st.integers(40, 260))
    frame = synthetic_bars(draw(st.sampled_from(list(Scenario))), draw(st.integers(0, 9999)), n)
    rng = np.random.default_rng(draw(st.integers(0, 2**31)))
    density = draw(st.floats(0.02, 0.3))
    sig = Signals(*(rng.random(n) < density for _ in range(4)))
    flags = draw(st.floats(0, 0.1))
    market = Market(
        frame=frame,
        atr=get_spec("atr").run(frame, {"length": draw(st.integers(1, 20))})["atr"],
        period=cap_periods(frame, Interval.D1, draw(st.sampled_from(["day", "week", "month"]))),
        session_end=rng.random(n) < flags,
        no_entry=rng.random(n) < flags,
        session_open=rng.random(n) < flags,
        bars_per_year=252.0,
    )
    exits = Exits(
        on_opposite=draw(st.booleans()),
        stop=draw(levels),
        target=draw(levels),
        trailing=draw(levels),
        time_stop_bars=draw(st.one_of(st.none(), st.integers(1, 30))),
    )
    return {
        "market": market,
        "signals": sig,
        "exits": exits,
        "max_trades": draw(st.integers(1, 6)),
        "settings": Settings(
            capital=draw(st.floats(1_000, 1e6)),
            cost=draw(st.sampled_from([0.0, 0.0005, 0.003])),
            decide_after=draw(st.integers(1, 6)),
            reversal_window=draw(st.integers(1, 30)),
        ),
        "start": draw(st.integers(0, 20)),
        "hindsight": draw(st.booleans()),
    }


@settings(max_examples=400, deadline=None)
@given(case=cases())
def test_the_engine_equals_its_golden_model(case: dict[str, object]) -> None:
    got = run(**case)  # type: ignore[arg-type]
    want = golden_run(**case)  # type: ignore[arg-type]
    np.testing.assert_allclose(got.equity, want["equity"], rtol=RTOL, atol=ATOL)
    assert got.in_market.tolist() == want["held"]
    assert got.open_at_end == want["open_at_end"]
    assert len(got.trades) == len(want["trades"])
    for mine, theirs in zip(got.trades, want["trades"], strict=True):
        a = asdict(mine)
        for key, value in theirs.items():
            if isinstance(value, float):
                np.testing.assert_allclose(a[key], value, rtol=RTOL, atol=ATOL, err_msg=key)
            else:
                assert a[key] == value, key
    d, c = got.decisions, want["counts"]
    assert (d.skipped_by_cap, d.conflicts, d.conflict_long, d.conflict_short, d.conflict_none) == (
        c["skipped"],
        c["conflicts"],
        c["c_long"],
        c["c_short"],
        c["c_none"],
    )
    assert (d.opposite, d.reversed, d.closed, d.held) == (c["opp"], c["rev"], c["close"], c["hold"])
