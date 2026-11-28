"""Golden model of the backtest engine (ADR 0037), written from the rules, not from the engine.

Plain Python over lists, one explicit phase after another per bar, state in a dict. Slow and
obvious on purpose; the engine must agree with it to 1e-9 on every bar and every trade.
"""

from __future__ import annotations

import math
from typing import Any

from app.backtest.engine import Market, Settings
from app.backtest.signals import Signals
from app.backtest.strategy import Exits, Level

ORDER = ["reverse", "close", "hold"]


def _level_distance(level: Level | None, price: float, atr: float) -> float | None:
    if level is None:
        return None
    d = price * level.value / 100.0 if level.kind == "percent" else atr * level.value
    if math.isnan(d) or d <= 0:
        return None
    return d


def _side_log(g: float, side: int) -> float:
    if side == 1:
        return math.log(g)
    return math.log(max(2.0 - g, 1e-12))


def _scores(g: float, held: int, cost: float) -> list[float]:
    fee = math.log(1.0 - cost)
    return [2 * fee + _side_log(g, -held), fee, _side_log(g, held)]  # reverse, close, hold


def _pick(values: list[float]) -> str:
    best = 0
    for i in range(1, 3):
        if values[i] > values[best]:
            best = i
    return ORDER[best]


def golden_run(  # noqa: PLR0912, PLR0915 - a model is one long, plain loop
    market: Market,
    signals: Signals,
    exits: Exits,
    max_trades: int,
    settings: Settings,
    start: int = 0,
    *,
    hindsight: bool = False,
) -> dict[str, Any]:
    f = market.frame
    opens, highs, lows, closes = (
        f.open.tolist(),
        f.high.tolist(),
        f.low.tolist(),
        f.close.tolist(),
    )
    n = len(opens)
    cost = settings.cost
    big_h = settings.reversal_window
    st: dict[str, Any] = {"cash": settings.capital, "pos": None, "order": None}
    trades: list[dict[str, Any]] = []
    equity: list[float] = []
    held: list[bool] = []
    per_period: dict[int, int] = {}
    finished: dict[int, list[tuple[float, int]]] = {1: [], -1: []}  # (log growth, bars)
    events: list[tuple[int, int]] = []
    counts = dict.fromkeys(
        ["skipped", "conflicts", "c_long", "c_short", "c_none", "opp", "rev", "close", "hold"], 0
    )
    totals = [0.0, 0.0, 0.0]
    done = 0
    ruined = False

    def finish(t: int, price: float, why: str, count_bar: bool) -> None:
        p = st["pos"]
        if count_bar:
            p["lo"] = min(p["lo"], lows[t])
            p["hi"] = max(p["hi"], highs[t])
        if p["side"] == 1:
            st["cash"] = st["cash"] + p["units"] * price - cost * p["units"] * price
        else:
            st["cash"] = st["cash"] - p["units"] * price - cost * p["units"] * price
        r = st["cash"] / p["before"] - 1.0
        nbars = t - p["at"] + 1 if count_bar else t - p["at"]
        if p["side"] == 1:
            mae, mfe = p["lo"] / p["price"] - 1.0, p["hi"] / p["price"] - 1.0
        else:
            mae, mfe = -(p["hi"] / p["price"] - 1.0), -(p["lo"] / p["price"] - 1.0)
        trades.append(
            {
                "side": p["side"],
                "entry_index": p["at"],
                "entry_price": p["price"],
                "exit_index": t,
                "exit_price": price,
                "reason": why,
                "bars": nbars,
                "pnl": st["cash"] - p["before"],
                "ret": r,
                "r_multiple": None if p["risk"] is None else r / p["risk"],
                "mae": mae,
                "mfe": mfe,
            }
        )
        finished[p["side"]].append((math.log(max(1.0 + r, 1e-12)), nbars))
        st["pos"] = None

    def enter(t: int, side: int, price: float) -> None:
        before = st["cash"]
        if side == 1:
            st["cash"] = before - before - cost * before
        else:
            st["cash"] = before + before - cost * before
        atr = market.atr[t - 1] if t >= 1 else math.nan
        ds = _level_distance(exits.stop, price, atr)
        dt = _level_distance(exits.target, price, atr)
        dtr = _level_distance(exits.trailing, price, atr)
        st["pos"] = {
            "side": side,
            "units": before / price,
            "at": t,
            "price": price,
            "before": before,
            "stop": None if ds is None else (price - ds if side == 1 else price + ds),
            "target": None if dt is None else (price + dt if side == 1 else price - dt),
            "trail": None if dtr is None else (price - dtr if side == 1 else price + dtr),
            "trail_d": 0.0 if dtr is None else dtr,
            "risk": None if ds is None else ds / price,
            "lo": price,
            "hi": price,
        }
        key = int(market.period[t])
        per_period[key] = per_period.get(key, 0) + 1

    for t in range(start, n):
        # 1. A position carried into a new session (Day) closes at its open.
        if st["pos"] is not None and bool(market.session_open[t]):
            finish(t, opens[t], "session", False)
        # 2. Orders made at the last close.
        if st["order"] is not None:
            kind, new_side, why = st["order"]
            st["order"] = None
            if kind in ("close", "reverse") and st["pos"] is not None:
                finish(t, opens[t], why, False)
            if kind in ("open", "reverse"):
                if per_period.get(int(market.period[t]), 0) >= max_trades:
                    counts["skipped"] += 1
                else:
                    enter(t, new_side, opens[t])
        # 3. Stops and targets inside the bar.
        if st["pos"] is not None:
            held_now = True
            p = st["pos"]
            if p["side"] == 1:
                cands = [x for x in (p["stop"], p["trail"]) if x is not None]
                stop = max(cands) if cands else None
                why = "trailing" if stop is not None and stop == p["trail"] else "stop"
                if stop is not None and opens[t] <= stop:
                    finish(t, opens[t], why, True)
                elif p["target"] is not None and opens[t] >= p["target"]:
                    finish(t, opens[t], "target", True)
                elif stop is not None and lows[t] <= stop:
                    finish(t, stop, why, True)
                elif p["target"] is not None and highs[t] >= p["target"]:
                    finish(t, p["target"], "target", True)
            else:
                cands = [x for x in (p["stop"], p["trail"]) if x is not None]
                stop = min(cands) if cands else None
                why = "trailing" if stop is not None and stop == p["trail"] else "stop"
                if stop is not None and opens[t] >= stop:
                    finish(t, opens[t], why, True)
                elif p["target"] is not None and opens[t] <= p["target"]:
                    finish(t, opens[t], "target", True)
                elif stop is not None and highs[t] >= stop:
                    finish(t, stop, why, True)
                elif p["target"] is not None and lows[t] <= p["target"]:
                    finish(t, p["target"], "target", True)
        else:
            held_now = False
        held.append(held_now)
        # 4. Extremes, the trailing level, the session end.
        if st["pos"] is not None:
            p = st["pos"]
            p["lo"] = min(p["lo"], lows[t])
            p["hi"] = max(p["hi"], highs[t])
            if p["trail"] is not None:
                if p["side"] == 1:
                    p["trail"] = max(p["trail"], highs[t] - p["trail_d"])
                else:
                    p["trail"] = min(p["trail"], lows[t] + p["trail_d"])
            if bool(market.session_end[t]):
                finish(t, closes[t], "session", True)
        # 5. Mark to market.
        if st["pos"] is None:
            value = st["cash"]
        else:
            p = st["pos"]
            value = st["cash"] + (
                p["units"] * closes[t] if p["side"] == 1 else -p["units"] * closes[t]
            )
            if value <= 0:
                finish(t, closes[t], "ruin", True)
                ruined = True
                value = st["cash"]
        equity.append(value)
        if ruined:
            while len(equity) < n - start:
                equity.append(value)
                held.append(False)
            break
        if t == n - 1:
            break
        # 6. Decisions at the close.
        le, se = bool(signals.long_entry[t]), bool(signals.short_entry[t])
        if st["pos"] is not None:
            p = st["pos"]
            if p["side"] == 1:
                own, opposite = bool(signals.long_exit[t]), se and not le
            else:
                own, opposite = bool(signals.short_exit[t]), le and not se
            timed = exits.time_stop_bars is not None and (t - p["at"] + 1) >= exits.time_stop_bars
            if own or timed:
                why = "exit" if own else "time"
                if opposite and not bool(market.no_entry[t]):
                    st["order"] = ("reverse", -p["side"], why)
                else:
                    st["order"] = ("close", 0, why)
            elif opposite and exits.on_opposite:
                counts["opp"] += 1
                if hindsight:
                    g = closes[min(t + big_h, n - 1)] / opens[t + 1]
                    choice = _pick(_scores(g, p["side"], cost))
                else:
                    while done < len(events) and events[done][0] + big_h <= t:
                        s0, side0 = events[done]
                        sc = _scores(closes[s0 + big_h] / opens[s0 + 1], side0, cost)
                        for i in range(3):
                            totals[i] += sc[i]
                        done += 1
                    choice = "reverse" if done < settings.decide_after else _pick(totals)
                if choice == "reverse" and bool(market.no_entry[t]):
                    choice = "close"
                if choice == "reverse":
                    counts["rev"] += 1
                    st["order"] = ("reverse", -p["side"], "opposite")
                elif choice == "close":
                    counts["close"] += 1
                    st["order"] = ("close", 0, "opposite")
                else:
                    counts["hold"] += 1
            if opposite:
                events.append((t, p["side"]))
        elif not bool(market.no_entry[t]):
            if le and se:
                counts["conflicts"] += 1
                if hindsight:
                    g = closes[min(t + big_h, n - 1)] / opens[t + 1]
                    fee = math.log(1.0 - cost)
                    gl, gs = fee + _side_log(g, 1), fee + _side_log(g, -1)
                    pick = 0 if max(gl, gs) <= 0 else (1 if gl >= gs else -1)
                elif (
                    len(finished[1]) < settings.decide_after
                    or len(finished[-1]) < settings.decide_after
                ):
                    pick = 0
                else:
                    ann = {}
                    for s in (1, -1):
                        lg = sum(x for x, _ in finished[s])
                        nb = sum(b for _, b in finished[s])
                        ann[s] = math.exp(lg / nb * market.bars_per_year) - 1.0
                    pick = 0 if ann[1] == ann[-1] else (1 if ann[1] > ann[-1] else -1)
                counts[{1: "c_long", -1: "c_short", 0: "c_none"}[pick]] += 1
                if pick != 0:
                    st["order"] = ("open", pick, "")
            elif le:
                st["order"] = ("open", 1, "")
            elif se:
                st["order"] = ("open", -1, "")
    open_at_end = st["pos"] is not None
    if open_at_end:
        finish(n - 1, closes[n - 1], "end", True)
        equity[-1] = st["cash"]
    return {
        "equity": equity,
        "held": held,
        "trades": trades,
        "counts": counts,
        "open_at_end": open_at_end,
    }
