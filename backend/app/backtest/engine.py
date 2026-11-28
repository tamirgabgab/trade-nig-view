r"""The backtest engine (B1, ADR 0037): one symbol, one strategy, bar by bar.

**Orders.** Signals are read at the close of bar :math:`t`; the orders they make fill at the open
of bar :math:`t + 1`. An entry is refused at its open when the trade cap of that bar's period
(the profile's day, week, month or year) is used up; it is counted, never silently dropped.

**Size and costs.** An entry takes the whole equity :math:`E` as its notional (no leverage beyond
the fee): :math:`u = E / p` units. Every fill pays :math:`c` times its traded value (commission and
slippage together). The equity is :math:`\text{cash} + s\,u\,P` for side :math:`s = \pm 1`, so a
long round trip from :math:`p` to :math:`q` returns :math:`(1-c)\,q/p - c - 1` and a short one
:math:`1 - c - (1+c)\,q/p`.

**Exits inside a bar** (stop, target, trailing stop; levels from the fill price, the ATR of the
signal bar, the trailing level moved by each bar's extreme only after that bar): the open first,
so a gap through a level fills at the open; when the stop and the target are both inside one bar,
the **stop** fills (conservative). A position opened at an open can be stopped in that bar.

**At the close**, in this order: the Day profile's session end (flat at that bar's close; a position
still held at a new session's first open, after an early close, is closed there); then
the signals. In a position its own exit signal or the time stop closes it, and an opposite entry
on that bar reverses it. An opposite entry alone (with ``exits.on_opposite``) is a **reversal
decision**: reverse, close or hold, by what each earned after earlier opposite entries whose
window of :math:`H` bars has ended (:math:`p_0` the next open, :math:`p_1` the close :math:`H` bars
on, :math:`g = p_1 / p_0`):

.. math::
    \text{hold} = \ln g_s,\quad \text{close} = \ln(1-c),\quad
    \text{reverse} = 2\ln(1-c) + \ln g_{-s},\qquad g_{+1} = g,\ g_{-1} = 2 - g

The best mean decides once ``decide_after`` windows have ended; before, it reverses. Flat, when
both entries fire (a **conflict**), the side whose closed trades earned the higher net annual
return :math:`\exp\!\big(\tfrac{\sum \ln(1+r_i)}{\sum b_i}\,B\big) - 1` (bars :math:`b_i`, bars a
year :math:`B`) is taken once each side has ``decide_after`` closed trades; before, neither.

**Hindsight** (``hindsight=True``): the same run, but each reversal and conflict decision is made
with its own **future** window. Not achievable: a ceiling to compare with, never a result.

A position still open after the last bar is closed at its close (``open_at_end``).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import numpy.typing as npt

from app.models.bars import BarFrame, FloatArray, IntArray

from .signals import Signals
from .strategy import Exits, Level

BoolArray = npt.NDArray[np.bool_]
Action = Literal["reverse", "close", "hold"]
ACTIONS: tuple[Action, ...] = ("reverse", "close", "hold")  # ties go to the first


@dataclass(frozen=True, slots=True)
class Settings:
    capital: float = 100_000.0
    cost: float = 0.0005  # per side, a fraction of the traded value
    decide_after: int = 5
    reversal_window: int = 20


@dataclass(frozen=True, slots=True, eq=False)
class Market:
    """The bars and what the profile adds to them, one value per bar."""

    frame: BarFrame
    atr: FloatArray
    period: IntArray  # the trade cap's period of each bar
    session_end: BoolArray  # Day: flat at this bar's close
    no_entry: BoolArray  # Day: a signal on this bar opens nothing
    session_open: BoolArray  # Day: a new session's first bar (flat at its open if still held)
    bars_per_year: float


@dataclass(frozen=True, slots=True)
class Trade:
    side: int
    entry_index: int
    entry_price: float
    exit_index: int
    exit_price: float
    reason: str
    bars: int
    pnl: float
    ret: float  # net of both fills' costs
    r_multiple: float | None  # ret over the initial stop distance (null without a stop)
    mae: float  # the worst move of the position while held (as a return)
    mfe: float  # the best


@dataclass(slots=True)
class Decisions:
    skipped_by_cap: int = 0
    conflicts: int = 0
    conflict_long: int = 0
    conflict_short: int = 0
    conflict_none: int = 0
    opposite: int = 0
    reversed: int = 0
    closed: int = 0
    held: int = 0
    #: Mean net annual return of each reversal action over the ended windows (at the end).
    scores: dict[str, float] = field(default_factory=dict[str, float])


@dataclass(frozen=True, slots=True, eq=False)
class Run:
    equity: FloatArray  # at each close from ``start``
    in_market: BoolArray  # a position was held during the bar
    trades: list[Trade]
    decisions: Decisions
    open_at_end: bool


@dataclass(slots=True)
class _Position:
    side: int
    units: float
    entry_index: int
    entry_price: float
    equity_before: float
    stop: float | None
    target: float | None
    trail: float | None
    trail_distance: float
    risk: float | None
    low: float
    high: float


def _distance(level: Level | None, price: float, atr: float) -> float | None:
    if level is None:
        return None
    d = price * level.value / 100 if level.kind == "percent" else atr * level.value
    return d if math.isfinite(d) and d > 0 else None  # no ATR yet: no level


def _log_growth(g: float, side: int) -> float:
    """ln of the equity factor of a whole-equity position over a price factor ``g``."""
    return math.log(g) if side == 1 else math.log(max(2.0 - g, 1e-12))


def action_scores(g: float, held: int, cost: float) -> dict[Action, float]:
    """Log growth of each reversal action over one window (``held``: the side being held)."""
    fee = math.log(1.0 - cost)
    return {
        "reverse": 2 * fee + _log_growth(g, -held),
        "close": fee,
        "hold": _log_growth(g, held),
    }


def _best(scores: dict[Action, float]) -> Action:
    return max(ACTIONS, key=lambda a: scores[a])  # max keeps the first of equal ones


def _annual(log_sum: float, bars: float, bars_per_year: float) -> float:
    return math.expm1(log_sum / bars * bars_per_year)


def run(  # noqa: PLR0912, PLR0915 - one bar loop, one state; the docstring is the map
    market: Market,
    signals: Signals,
    exits: Exits,
    max_trades: int,
    settings: Settings,
    start: int = 0,
    *,
    hindsight: bool = False,
) -> Run:
    """Trade ``signals`` on ``market`` from bar ``start`` (the signals cover all bars)."""
    f = market.frame
    o, h, lo, c = f.open, f.high, f.low, f.close
    n = len(f)
    cost, horizon = settings.cost, settings.reversal_window
    bpy = market.bars_per_year
    cash = settings.capital
    pos: _Position | None = None
    pending: tuple[str, int, str] | None = None  # (close | open | reverse, new side, reason)
    trades: list[Trade] = []
    dec = Decisions()
    cap_used: dict[int, int] = {}
    closed: dict[int, list[tuple[float, int]]] = {1: [], -1: []}
    events: list[tuple[int, int]] = []  # (bar, side held) of each opposite entry
    scored = 0
    sums: dict[Action, float] = dict.fromkeys(ACTIONS, 0.0)
    equity = np.empty(n - start)
    in_market = np.zeros(n - start, dtype=np.bool_)
    ruined = False

    def window(t: int) -> float | None:
        """Price factor from the open after ``t`` to the close ``horizon`` bars on."""
        if t + 1 >= n:
            return None
        return float(c[min(t + horizon, n - 1)] / o[t + 1])

    def close_at(t: int, price: float, reason: str, include_bar: bool) -> None:
        nonlocal cash, pos
        assert pos is not None  # noqa: S101 - callers check
        if include_bar:
            pos.low, pos.high = min(pos.low, float(lo[t])), max(pos.high, float(h[t]))
        value = pos.units * price
        cash += pos.side * value - cost * value
        ret = cash / pos.equity_before - 1.0
        bars = t - pos.entry_index + (1 if include_bar else 0)
        down, up = pos.low / pos.entry_price - 1.0, pos.high / pos.entry_price - 1.0
        trades.append(
            Trade(
                side=pos.side,
                entry_index=pos.entry_index,
                entry_price=pos.entry_price,
                exit_index=t,
                exit_price=price,
                reason=reason,
                bars=bars,
                pnl=cash - pos.equity_before,
                ret=ret,
                r_multiple=None if pos.risk is None else ret / pos.risk,
                mae=down if pos.side == 1 else -up,
                mfe=up if pos.side == 1 else -down,
            )
        )
        closed[pos.side].append((math.log(max(1.0 + ret, 1e-12)), bars))
        pos = None

    def open_at(t: int, side: int, price: float) -> None:
        nonlocal cash, pos
        notional = cash
        cash -= side * notional + cost * notional  # a long pays for its units, a short receives
        atr = float(market.atr[t - 1]) if t > 0 else math.nan
        stop = _distance(exits.stop, price, atr)
        target = _distance(exits.target, price, atr)
        trail = _distance(exits.trailing, price, atr)
        pos = _Position(
            side=side,
            units=notional / price,
            entry_index=t,
            entry_price=price,
            equity_before=notional,
            stop=None if stop is None else price - side * stop,
            target=None if target is None else price + side * target,
            trail=None if trail is None else price - side * trail,
            trail_distance=trail or 0.0,
            risk=None if stop is None else stop / price,
            low=price,
            high=price,
        )
        cap_used[int(market.period[t])] = cap_used.get(int(market.period[t]), 0) + 1

    def risk_exit(t: int) -> None:
        """Stop (or trailing stop) and target inside bar ``t``: the open first, then the stop."""
        assert pos is not None  # noqa: S101 - callers check
        s = pos.side
        levels = [x for x in (pos.stop, pos.trail) if x is not None]
        stop = (max(levels) if s == 1 else min(levels)) if levels else None
        why = "trailing" if stop is not None and stop == pos.trail else "stop"
        first = float(o[t])
        worst, best = (float(lo[t]), float(h[t])) if s == 1 else (float(h[t]), float(lo[t]))
        # s * (price - level) <= 0: the price is at or beyond the level against the position.
        if stop is not None and s * (first - stop) <= 0:
            close_at(t, first, why, True)
        elif pos.target is not None and s * (first - pos.target) >= 0:
            close_at(t, first, "target", True)
        elif stop is not None and s * (worst - stop) <= 0:
            close_at(t, stop, why, True)
        elif pos.target is not None and s * (best - pos.target) >= 0:
            close_at(t, pos.target, "target", True)

    def reversal(t: int, held: int) -> Action:
        nonlocal scored
        if hindsight:
            g = window(t)
            return "reverse" if g is None else _best(action_scores(g, held, cost))
        while scored < len(events) and events[scored][0] + horizon <= t:
            s, side = events[scored]
            for a, v in action_scores(float(c[s + horizon] / o[s + 1]), side, cost).items():
                sums[a] += v
            scored += 1
        return "reverse" if scored < settings.decide_after else _best(sums)

    def conflict(t: int) -> int:
        if hindsight:
            g = window(t)
            if g is None:
                return 0
            fee = math.log(1.0 - cost)
            long_, short = fee + _log_growth(g, 1), fee + _log_growth(g, -1)
            return 0 if max(long_, short) <= 0 else (1 if long_ >= short else -1)
        if min(len(closed[1]), len(closed[-1])) < settings.decide_after:
            return 0
        annual = {
            s: _annual(sum(r for r, _ in closed[s]), sum(b for _, b in closed[s]), bpy)
            for s in (1, -1)
        }
        return 0 if annual[1] == annual[-1] else (1 if annual[1] > annual[-1] else -1)

    for t in range(start, n):
        if pos is not None and market.session_open[t]:  # held over a close nobody announced
            close_at(t, float(o[t]), "session", False)
        if pending is not None:
            action, side, reason = pending
            pending = None
            if pos is not None and action in ("close", "reverse"):
                close_at(t, float(o[t]), reason, False)
            if action in ("open", "reverse"):
                if cap_used.get(int(market.period[t]), 0) >= max_trades:
                    dec.skipped_by_cap += 1
                else:
                    open_at(t, side, float(o[t]))
        if pos is not None:
            in_market[t - start] = True
            risk_exit(t)
        if pos is not None:
            pos.low, pos.high = min(pos.low, float(lo[t])), max(pos.high, float(h[t]))
            if pos.trail is not None:
                d = pos.trail_distance
                pos.trail = (
                    max(pos.trail, float(h[t]) - d)
                    if pos.side == 1
                    else min(pos.trail, float(lo[t]) + d)
                )
            if market.session_end[t]:
                close_at(t, float(c[t]), "session", True)
        mark = cash if pos is None else cash + pos.side * pos.units * float(c[t])
        if pos is not None and mark <= 0:
            close_at(t, float(c[t]), "ruin", True)
            ruined = True
            mark = cash
        equity[t - start] = mark
        if t == n - 1 or ruined:
            if ruined:
                equity[t - start + 1 :] = mark
                break
            continue

        long_e, short_e = bool(signals.long_entry[t]), bool(signals.short_entry[t])
        if pos is not None:
            s = pos.side
            own = bool((signals.long_exit if s == 1 else signals.short_exit)[t])
            timed = (
                exits.time_stop_bars is not None and t - pos.entry_index + 1 >= exits.time_stop_bars
            )
            opposite = (short_e and not long_e) if s == 1 else (long_e and not short_e)
            if own or timed:
                reason = "exit" if own else "time"
                can_open = opposite and not market.no_entry[t]
                pending = ("reverse", -s, reason) if can_open else ("close", 0, reason)
            elif opposite and exits.on_opposite:
                dec.opposite += 1
                choice = reversal(t, s)
                if choice == "reverse" and market.no_entry[t]:
                    choice = "close"
                if choice == "reverse":
                    dec.reversed += 1
                    pending = ("reverse", -s, "opposite")
                elif choice == "close":
                    dec.closed += 1
                    pending = ("close", 0, "opposite")
                else:
                    dec.held += 1
            if opposite:
                events.append((t, s))
        elif not market.no_entry[t]:
            if long_e and short_e:
                dec.conflicts += 1
                side = conflict(t)
                if side == 1:
                    dec.conflict_long += 1
                elif side == -1:
                    dec.conflict_short += 1
                else:
                    dec.conflict_none += 1
                if side:
                    pending = ("open", side, "")
            elif long_e or short_e:
                pending = ("open", 1 if long_e else -1, "")

    open_at_end = pos is not None
    if pos is not None:
        close_at(n - 1, float(c[n - 1]), "end", True)
        equity[-1] = cash
    if not hindsight and scored:
        dec.scores = {a: _annual(sums[a], scored * horizon, bpy) for a in ACTIONS}
    return Run(equity, in_market, trades, dec, open_at_end)
