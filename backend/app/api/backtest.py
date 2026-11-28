"""``POST /api/backtest`` - run a strategy on a symbol's history (B1, ADR 0037).

The strategy's signals (``/strategies/signals``) go through the engine from ``start`` to
``until``; the answer has the metrics of the strategy, of buy-and-hold over the same bars, and the
hindsight ceiling (decisions made with the future: never achievable), the trades, the decisions
and the equity curves.
"""

from __future__ import annotations

import math
from datetime import date
from http import HTTPStatus
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_bar_service, get_python_strategies
from app.api.strategies import SignalsRequest, Times, bar_times, evaluate
from app.backtest.engine import Settings, Trade, run
from app.backtest.market import YEAR_SECONDS, build_market, first_bar
from app.backtest.metrics import Metrics, buy_and_hold, compute
from app.backtest.python_loader import PythonStrategies
from app.data.bar_service import BarService
from app.errors import ChartLabError
from app.models.bars import Interval

router = APIRouter(tags=["backtest"])


class TooFewBarsError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "too_few_bars"


class BacktestSettings(BaseModel):
    capital: float = Field(default=100_000, gt=0, le=1e12, description="Starting equity")
    cost_pct: float = Field(
        default=0.05,
        ge=0,
        le=5,
        description="Per fill, % of the traded value (commission and slippage together)",
    )
    decide_after: int = Field(
        default=5,
        ge=1,
        le=1000,
        description="Ended reversal windows, and closed trades on each side for a conflict, "
        "before the past decides",
    )
    reversal_window: int | None = Field(
        default=None, ge=1, le=10_000, description="H in decision bars; null = the profile's"
    )


class BacktestRequest(SignalsRequest):
    start: date | None = Field(default=None, description="First bar traded (inclusive)")
    settings: BacktestSettings = Field(default_factory=BacktestSettings)


class TradeOut(BaseModel):
    side: str = Field(description="long or short")
    entry_time: str | int
    entry_price: float
    exit_time: str | int
    exit_price: float
    reason: str = Field(
        description="exit, time, opposite, stop, trailing, target, session, ruin or end"
    )
    bars: int
    pnl: float
    ret: float = Field(description="Net return of the trade (both fills' costs in)")
    r_multiple: float | None
    mae: float
    mfe: float


class DecisionsOut(BaseModel):
    skipped_by_cap: int
    conflicts: int
    conflict_long: int
    conflict_short: int
    conflict_none: int
    opposite: int = Field(description="Opposite entries while in a position (decisions)")
    reversed: int
    closed: int
    held: int
    scores: dict[str, float | None] = Field(
        description="Net annual return of reversing, closing and holding over the ended windows "
        "(null: beyond any number)"
    )


class Hindsight(BaseModel):
    net_profit: float
    total_return: float
    cagr: float | None


class BacktestResponse(BaseModel):
    symbol: str
    interval: Interval
    bars: int = Field(description="Bars traded, from `start`")
    max_trades: int
    reversal_window: int
    strategy: Metrics
    buy_and_hold: Metrics
    hindsight: Hindsight = Field(
        description="The same run deciding reversals and conflicts with the future: a ceiling"
    )
    decisions: DecisionsOut
    open_at_end: bool
    trades: list[TradeOut]
    time: Times
    equity: list[float]
    buy_and_hold_equity: list[float]


@router.post("/backtest", response_model=BacktestResponse)
def backtest(
    body: BacktestRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    files: Annotated[PythonStrategies, Depends(get_python_strategies)],
) -> BacktestResponse:
    ev = evaluate(body, service, files)
    frame, strategy, profile = ev.bars.frame, body.strategy, ev.profile
    start = 0 if body.start is None else first_bar(frame, ev.interval, body.start)
    if len(frame) - start < 2:  # noqa: PLR2004 - a return needs two bars
        raise TooFewBarsError(f"Fewer than two {ev.interval} bars to trade from {body.start}")
    market = build_market(
        frame, ev.interval, profile, ev.bars.symbol, strategy.exits.atr_length, start
    )
    s = body.settings
    settings = Settings(
        capital=s.capital,
        cost=s.cost_pct / 100,
        decide_after=s.decide_after,
        reversal_window=s.reversal_window or profile.reversal_window,
    )
    max_trades = strategy.max_trades or profile.default_max_trades
    years = float(frame.time[-1] - frame.time[start]) / YEAR_SECONDS
    bpy = market.bars_per_year
    result = run(market, ev.signals, strategy.exits, max_trades, settings, start)
    ceiling = run(market, ev.signals, strategy.exits, max_trades, settings, start, hindsight=True)
    hold = buy_and_hold(frame.open[start:], frame.close[start:], s.capital, settings.cost)
    held = Trade(
        side=1,
        entry_index=start,
        entry_price=float(frame.open[start]),
        exit_index=len(frame) - 1,
        exit_price=float(frame.close[-1]),
        reason="end",
        bars=len(frame) - start,
        pnl=float(hold[-1] - s.capital),
        ret=float(hold[-1] / s.capital - 1),
        r_multiple=None,
        mae=float(frame.low[start:].min() / frame.open[start] - 1),
        mfe=float(frame.high[start:].max() / frame.open[start] - 1),
    )
    top = compute(ceiling.equity, ceiling.trades, ceiling.in_market, years, bpy)
    times = bar_times(frame.time, ev.interval)
    d = result.decisions
    return BacktestResponse(
        symbol=ev.bars.symbol.symbol,
        interval=ev.interval,
        bars=len(frame) - start,
        max_trades=max_trades,
        reversal_window=settings.reversal_window,
        strategy=compute(result.equity, result.trades, result.in_market, years, bpy),
        buy_and_hold=compute(hold, [held], np.ones(len(hold), dtype=np.bool_), years, bpy),
        hindsight=Hindsight(
            net_profit=top.net_profit, total_return=top.total_return, cagr=top.cagr
        ),
        decisions=DecisionsOut(
            skipped_by_cap=d.skipped_by_cap,
            conflicts=d.conflicts,
            conflict_long=d.conflict_long,
            conflict_short=d.conflict_short,
            conflict_none=d.conflict_none,
            opposite=d.opposite,
            reversed=d.reversed,
            closed=d.closed,
            held=d.held,
            scores={a: v if math.isfinite(v) else None for a, v in d.scores.items()},
        ),
        open_at_end=result.open_at_end,
        trades=[
            TradeOut(
                side="long" if t.side == 1 else "short",
                entry_time=times[t.entry_index],
                entry_price=t.entry_price,
                exit_time=times[t.exit_index],
                exit_price=t.exit_price,
                reason=t.reason,
                bars=t.bars,
                pnl=t.pnl,
                ret=t.ret,
                r_multiple=t.r_multiple,
                mae=t.mae,
                mfe=t.mfe,
            )
            for t in result.trades
        ],
        time=times[start:],
        equity=result.equity.tolist(),
        buy_and_hold_equity=hold.tolist(),
    )
