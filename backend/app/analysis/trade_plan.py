r"""The trade plan (P3, round T1): the chances of an entry, a target and a stop over the next h
bars, from the history's own paths at today's volatility.

**Paths.** Every past bar s with h bars after it (all before the origin) gives a path: the next h
bars' open, high, low and close as log ratios to :math:`C_s`, divided by the volatility at s and
multiplied by today's (Yang-Zhang over a month, ``app.indicators.hv``): filtered historical
simulation of whole paths, so the gaps, the tails and the clustering inside a path stay real.
Deterministic: every window once, no random draws.

**Fill.** An entry at the origin's close fills at once. Any other entry is an order that fills when
a bar touches it (a gap through it fills at the open); everything else is given the fill.

**Exits.** From the bar after the fill: the first bar whose high reaches the target or whose low
reaches the stop. A gap beyond a level exits at the open. A bar that touches both is split with
the Brownian bridge: the probability that the target is hit first, for a Brownian motion from the
open to the close of the bar (its variance from the bar's own range, Parkinson) that touches
both levels. On the fill bar a stop touch counts (conservative); a target touch counts only when
the price had to pass the entry first. No exit by the h-th bar: out at its close.

**Bridge.** In units of the bar's volatility, levels :math:`a > 0 > -b` around the open, close
:math:`x`:

.. math::
    P(a \text{ first} \mid W_1 = x, \text{both}) = \frac{U}{U + D}, \quad
    U = \int_0^1 f_{a}(t)\, g_{a\to -b}(x, 1-t)\, dt, \quad
    D = \int_0^1 f_{-b}(t)\, g_{-b\to a}(x, 1-t)\, dt

with :math:`f_a(t) = \sum_k \frac{a + 2kw}{\sqrt{2\pi t^3}} e^{-(a+2kw)^2/2t}`
(:math:`w = a + b`) the density of leaving the band through a at t, and :math:`g` the density
of ending at x after touching the other level (reflection). Tabulated once and interpolated.

**Outputs.** P(fill); given the fill P(target), P(stop), P(neither), the mean bars to the exit,
the expected R (gain over the planned risk :math:`|entry - stop|`), the mean loss when stopped,
:math:`f^* \approx E[R]/E[R^2]` (Kelly), and the bounds of P(target) with every two-level bar
given to the stop or to the target. The EV heat map repeats it for target and stop distances of
0.25 to 3 :math:`\sigma\sqrt h`. The calibration scores those 36 plans at each of the last 500
origins with paths that ended before it (refit every 50 bars).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import cache
from typing import Literal

import numpy as np
import numpy.typing as npt

from app.analysis.volatility import horizon_bars
from app.indicators import hv
from app.models.bars import BarFrame, FloatArray

Matrix = npt.NDArray[np.float64]
Bools = npt.NDArray[np.bool_]
Ints = npt.NDArray[np.int64]
Side = Literal["long", "short"]
#: "both": the deciding bar touched both levels (OHLC cannot tell; actual_r is the bridge's mean).
Actual = Literal["target", "stop", "both", "neither", "open", "not_filled"]

#: Bar range over its volatility for a Brownian bar (Parkinson): E[ln(H/L)^2] = 4 ln 2 sigma^2.
RANGE_SIGMAS = 2 * math.sqrt(math.log(2))
MULTIPLES: tuple[float, ...] = (0.25, 0.5, 1.0, 1.5, 2.0, 3.0)
EVALUATE = 500
REFIT = 50
MIN_PATHS = 100
BINS = 10
TINY = 1e-12
#: Below this |2 mu (up + down) / sigma^2| the ruin formula is the driftless one.
DRIFTLESS = 1e-9

# --- the Brownian bridge ------------------------------------------------------------------------

_K = np.arange(-3, 4)
_NODES, _WEIGHTS = np.polynomial.legendre.leggauss(96)
_T = (_NODES + 1) / 2
_W = _WEIGHTS / 2


def _phi(y: Matrix, s: Matrix) -> Matrix:
    return np.exp(-(y * y) / (2 * s)) / np.sqrt(2 * np.pi * s)


def _exit_density(a: FloatArray, b: FloatArray) -> Matrix:
    """(m, nodes): density of leaving (-b, a) through a at each node time, from 0."""
    w = (a + b)[:, None, None]
    m = a[:, None, None] + 2 * _K[None, None, :] * w
    t = _T[None, :, None]
    return (m / np.sqrt(2 * np.pi * t**3) * np.exp(-(m * m) / (2 * t))).sum(axis=2)


def bridge_target_first(a: FloatArray, b: FloatArray, x: FloatArray) -> FloatArray:
    """P(the level a is hit before -b | Brownian motion (unit variance over the bar) from 0 to x
    that touches both). Exact up to the series and quadrature truncation."""
    s = (1 - _T)[None, :]
    xx = x[:, None]
    aa, bb = a[:, None], b[:, None]
    after_a = np.where(xx <= -bb, _phi(xx - aa, s), _phi(-2 * bb - xx - aa, s))
    after_b = np.where(xx >= aa, _phi(xx + bb, s), _phi(2 * aa - xx + bb, s))
    up = (_exit_density(a, b) * after_a) @ _W
    down = (_exit_density(b, a) * after_b) @ _W
    total = up + down
    return np.where(total > 0, up / np.where(total > 0, total, 1.0), 0.5)


_GRID = np.linspace(0.0, 1.7, 35)
_XGRID = np.linspace(-1.7, 1.7, 69)


@cache
def _bridge_table() -> Matrix:
    """P(target first) on the (a, b, x) grid (computed once, about a second)."""
    a, b, x = np.meshgrid(_GRID, _GRID, _XGRID, indexing="ij")
    a, b, x = a.ravel(), b.ravel(), x.ravel()
    p = np.full(a.shape, 0.5)
    ok = (a > 0) & (b > 0)
    p[(a == 0) & (b > 0)] = 1.0
    p[(b == 0) & (a > 0)] = 0.0
    idx = np.flatnonzero(ok)
    for chunk in np.array_split(idx, max(1, len(idx) // 4000)):
        p[chunk] = bridge_target_first(a[chunk], b[chunk], x[chunk])
    return p.reshape(len(_GRID), len(_GRID), len(_XGRID))


def bridge_lookup(a: FloatArray, b: FloatArray, x: FloatArray) -> FloatArray:
    """``bridge_target_first`` by trilinear interpolation of the table (inputs clipped to it)."""
    table = _bridge_table()

    def coords(v: FloatArray, grid: FloatArray) -> tuple[Ints, FloatArray]:
        pos = (np.clip(v, grid[0], grid[-1]) - grid[0]) / (grid[1] - grid[0])
        i = np.minimum(np.floor(pos).astype(np.int64), len(grid) - 2)
        return i, pos - i

    (i, fi), (j, fj), (k, fk) = coords(a, _GRID), coords(b, _GRID), coords(x, _XGRID)
    out = np.zeros(len(a))
    for di in (0, 1):
        for dj in (0, 1):
            for dk in (0, 1):
                weight = (fi if di else 1 - fi) * (fj if dj else 1 - fj) * (fk if dk else 1 - fk)
                out += weight * table[i + di, j + dj, k + dk]
    return out


# --- paths --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Paths:
    """(n, h) log ratios of each path's bars to its start close, in units of its start volatility
    (multiply by a volatility to use them)."""

    open: Matrix
    high: Matrix
    low: Matrix
    close: Matrix
    start: Ints  # the start bar s of each path


def unit_volatility(frame: BarFrame) -> FloatArray:
    """Per-bar volatility over a month (Yang-Zhang), the unit the paths are measured in."""
    per_year = float(hv.bars_per_year(frame.time)[-1]) if len(frame) > 1 else 252.0
    month = horizon_bars(per_year).get("month", 21)
    return np.sqrt(np.maximum(hv.rolling_variance(frame, "yang_zhang", month), 0.0))


def history_paths(frame: BarFrame, sigma: FloatArray, h: int) -> Paths:
    """Every window of h bars after a bar with a volatility, normalised by it."""
    n = len(frame)
    starts = np.arange(max(0, n - h))
    starts = starts[np.isfinite(sigma[starts]) & (sigma[starts] > 0)]
    rows = starts[:, None] + 1 + np.arange(h)[None, :]
    base = frame.close[starts][:, None]
    scale = sigma[starts][:, None]

    def rel(x: FloatArray) -> Matrix:
        return np.log(x[rows] / base) / scale

    return Paths(rel(frame.open), rel(frame.high), rel(frame.low), rel(frame.close), starts)


def subset(p: Paths, keep: Bools) -> Paths:
    return Paths(p.open[keep], p.high[keep], p.low[keep], p.close[keep], p.start[keep])


def _first(hit: Bools) -> Ints:
    """Index of the first True per row (the row length if none)."""
    any_hit = hit.any(axis=1)
    return np.where(any_hit, hit.argmax(axis=1), hit.shape[1])


@dataclass(frozen=True, slots=True)
class Outcomes:
    """Per path (given the fill): the weights of target, stop and neither (summing to 1), the R
    of each, the exit bar; the ambiguous weight (two-level bars) for the bounds."""

    filled: Bools
    target: FloatArray
    stop: FloatArray
    neither: FloatArray
    r_target: FloatArray
    r_stop: FloatArray
    r_neither: FloatArray
    bars: FloatArray
    ambiguous: FloatArray


def simulate(
    p: Paths, scale: float, entry: float, target: float, stop: float, sign: int = 1
) -> Outcomes:
    """Long orientation (stop < entry < target), levels in log ratios to the start close; the
    paths are multiplied by ``scale`` (today's volatility). A short plan is negated first
    (``sign`` -1), so its R is measured on the prices :math:`e^{-x}`."""
    o, hi, lo, c = p.open * scale, p.high * scale, p.low * scale, p.close * scale
    n, h = o.shape
    rows: Ints = np.arange(n, dtype=np.int64)

    def money(x: FloatArray | float) -> FloatArray:  # profit per unit start price, oriented
        return sign * np.exp(sign * np.asarray(x, dtype=np.float64))

    risk = float(money(entry) - money(stop))
    immediate = abs(entry) < TINY
    if immediate:
        fill_bar = np.full(n, -1)
        fill_price = np.zeros(n)
    elif entry < 0:  # a limit below the close: fills on the way down
        fill_bar = _first(lo <= entry)
        safe = np.minimum(fill_bar, h - 1)
        fill_price = np.minimum(o[rows, safe], entry)
    else:  # a stop order above the close: fills on the way up
        fill_bar = _first(hi >= entry)
        safe = np.minimum(fill_bar, h - 1)
        fill_price = np.maximum(o[rows, safe], entry)
    filled = fill_bar < h
    bar_index: Ints = np.arange(h, dtype=np.int64)[None, :]
    after: Bools = bar_index > fill_bar[:, None]
    on_fill: Bools = bar_index == fill_bar[:, None]
    hit_t = hi >= target
    hit_s = lo <= stop
    # On the fill bar: a stop touch counts; a target touch only when the price had to pass the
    # entry first (an order above the close, rising through it).
    stop_any: Bools = (after | on_fill) & hit_s
    target_any: Bools = (after | (on_fill & (entry > 0))) & hit_t
    exit_bar = _first(stop_any | target_any)
    exits = exit_bar < h
    k = np.minimum(exit_bar, h - 1)
    ok, oh, ol, oc = o[rows, k], hi[rows, k], lo[rows, k], c[rows, k]
    both: Bools = exits & stop_any[rows, k] & target_any[rows, k]
    w_target: FloatArray = np.where(exits & target_any[rows, k] & ~both, 1.0, 0.0)
    w_stop: FloatArray = np.where(exits & stop_any[rows, k] & ~both, 1.0, 0.0)
    # The fill bar's two-level touches go to the stop (cautious; counted in the bounds below).
    fill_both: Bools = both & (k == fill_bar)
    gap_up: Bools = both & ~fill_both & (ok >= target)
    gap_down: Bools = both & ~fill_both & (ok <= stop)
    split: Bools = both & ~fill_both & ~gap_up & ~gap_down
    sigma_bar = np.maximum((oh - ol) / RANGE_SIGMAS, TINY)
    p_up = np.zeros(n)
    if split.any():
        p_up[split] = bridge_lookup(
            (target - ok[split]) / sigma_bar[split],
            (ok[split] - stop) / sigma_bar[split],
            (oc[split] - ok[split]) / sigma_bar[split],
        )
    w_target += np.where(gap_up, 1.0, 0.0) + p_up * split
    w_stop += np.where(gap_down | fill_both, 1.0, 0.0) + (1 - p_up) * split
    # A gap beyond a level exits at the open; otherwise at the level.
    exit_target = np.where(ok >= target, ok, target)
    exit_stop = np.where(ok <= stop, ok, stop)
    exit_stop = np.where(k == fill_bar, np.minimum(stop, fill_price), exit_stop)
    neither = np.where(exits, 0.0, 1.0)
    return Outcomes(
        filled=filled,
        target=w_target,
        stop=w_stop,
        neither=neither,
        r_target=(money(exit_target) - money(fill_price)) / risk,
        r_stop=(money(exit_stop) - money(fill_price)) / risk,
        r_neither=(money(c[:, -1]) - money(fill_price)) / risk,
        bars=np.where(exits, k + 1, h).astype(np.float64),
        ambiguous=np.where(split | fill_both, 1.0, 0.0),
    )


# --- the plan -----------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Summary:
    paths: int
    p_fill: float
    p_target: float
    p_stop: float
    p_neither: float
    p_target_bounds: tuple[float, float]
    bars: float
    ev_r: float
    ev_return: float  # ev_r x |entry - stop| / entry: a fraction of the entry price
    loss_r: float  # mean R when stopped
    kelly: float


def summarise(out: Outcomes, risk: float) -> Summary | None:
    """``risk``: the planned risk |entry - stop| over the entry price (for the EV in %)."""
    f = out.filled
    if f.sum() == 0:
        return None
    t, s, nn = out.target[f], out.stop[f], out.neither[f]
    r = t * out.r_target[f] + s * out.r_stop[f] + nn * out.r_neither[f]
    r2 = t * out.r_target[f] ** 2 + s * out.r_stop[f] ** 2 + nn * out.r_neither[f] ** 2
    amb = out.ambiguous[f]
    p_t = float(t.mean())
    sure = float((t * (1 - amb)).mean())
    stop_weight = float(s.sum())
    return Summary(
        paths=len(f),
        p_fill=float(f.mean()),
        p_target=p_t,
        p_stop=float(s.mean()),
        p_neither=float(nn.mean()),
        p_target_bounds=(sure, sure + float(amb.mean())),
        bars=float(out.bars[f].mean()),
        ev_r=float(r.mean()),
        ev_return=float(r.mean() * risk),
        loss_r=float((s * out.r_stop[f]).sum() / stop_weight) if stop_weight > 0 else math.nan,
        kelly=float(r.mean() / r2.mean()) if r2.mean() > 0 else math.nan,
    )


def orient(side: Side, entry: float, target: float, stop: float) -> tuple[float, float, float]:
    """Long-oriented levels (a short plan is the long plan of the negated prices)."""
    return (entry, target, stop) if side == "long" else (-entry, -target, -stop)


def oriented_paths(p: Paths, side: Side) -> Paths:
    if side == "long":
        return p
    return Paths(-p.open, -p.low, -p.high, -p.close, p.start)


@dataclass(frozen=True, slots=True)
class Calibration:
    """Reliability of P(target) over the 36 plans at the last origins: per bin the mean forecast,
    the observed share and the count; the Brier score and the one of the base rate."""

    n: int
    forecast: tuple[float, ...]
    observed: tuple[float, ...]
    count: tuple[int, ...]
    brier: float
    brier_base: float


@dataclass(frozen=True, slots=True)
class Plan:
    side: Side
    h: int
    sigma: float  # today's per-bar volatility (log)
    summary: Summary | None
    heat: tuple[tuple[float | None, ...], ...]  # EV in R: rows = stop multiple, cols = target
    multiples: tuple[float, ...]
    reference: float  # Brownian P(target first), drift from history, no horizon
    calibration: Calibration | None
    actual: Actual | None
    actual_r: float | None


def brownian_reference(mu: float, sigma: float, up: float, down: float) -> float:
    """Gambler's ruin with drift: P(+up before -down) for drift mu and volatility sigma a bar."""
    if sigma <= 0:
        return math.nan
    k = 2 * mu / (sigma * sigma)
    if abs(k * (up + down)) < DRIFTLESS:
        return down / (up + down)
    return (1 - math.exp(-k * down)) / (1 - math.exp(-k * (up + down)))


def _grid_ev(
    p: Paths, scale: float, entry: float, h: int, sign: int
) -> tuple[tuple[float | None, ...], ...]:
    unit = scale * math.sqrt(h)
    rows: list[tuple[float | None, ...]] = []
    for ms in MULTIPLES:
        row: list[float | None] = []
        for mt in MULTIPLES:
            levels = (entry, entry + mt * unit, entry - ms * unit)
            s = summarise(simulate(p, scale, *levels, sign=sign), 1.0)
            row.append(None if s is None else s.ev_r)
        rows.append(tuple(row))
    return tuple(rows)


def calibrate(p: Paths, origin: int, h: int) -> Calibration | None:
    """Walk-forward: at each origin s (the last EVALUATE with an outcome), P(target first) of the
    36 grid plans (immediate entry) from the paths that ended by the last refit, against what s's
    own path did."""
    unit = math.sqrt(h)
    starts = p.start
    lo_origin = max(0, origin - h - EVALUATE + 1)
    forecasts: list[FloatArray] = []
    observed: list[FloatArray] = []
    for block in range(lo_origin, origin - h + 1, REFIT):
        pool = subset(p, starts + h <= block)
        mine = (starts >= block) & (starts < min(block + REFIT, origin - h + 1))
        if len(pool.start) < MIN_PATHS or not mine.any():
            continue
        own = subset(p, mine)
        for ms in MULTIPLES:
            for mt in MULTIPLES:
                levels = (0.0, mt * unit, -ms * unit)
                s = summarise(simulate(pool, 1.0, *levels), 1.0)
                if s is None:
                    continue
                o = simulate(own, 1.0, *levels).target
                forecasts.append(np.full(len(o), s.p_target))
                observed.append(o)
    if not forecasts:
        return None
    f, o = np.concatenate(forecasts), np.concatenate(observed)
    bins = np.minimum((f * BINS).astype(np.int64), BINS - 1)
    count = np.bincount(bins, minlength=BINS)
    sum_f = np.bincount(bins, weights=f, minlength=BINS)
    sum_o = np.bincount(bins, weights=o, minlength=BINS)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean_f, mean_o = sum_f / count, sum_o / count
    return Calibration(
        n=len(f),
        forecast=tuple(float(v) for v in mean_f),
        observed=tuple(float(v) for v in mean_o),
        count=tuple(int(v) for v in count),
        brier=float(np.mean((f - o) ** 2)),
        brier_base=float(np.mean((o.mean() - o) ** 2)),
    )


def _actual(
    frame: BarFrame, origin: int, h: int, side: Side, levels: tuple[float, float, float]
) -> tuple[Actual | None, float | None]:
    """What the bars after the origin did (in a replay or for a plan drawn in the past)."""
    m = min(h, len(frame) - 1 - origin)
    if m <= 0:
        return None, None
    window = frame.take(slice(origin, origin + m + 1))
    one = oriented_paths(history_paths(window, np.ones(m + 1), m), side)
    o = simulate(one, 1.0, *levels, sign=1 if side == "long" else -1)  # the one window at 0
    done = m >= h
    if not o.filled[0]:
        return ("not_filled" if done else "open"), None
    if o.neither[0] == 1.0:
        return ("neither" if done else "open"), float(o.r_neither[0])
    if o.ambiguous[0] == 1.0:
        mean = o.target[0] * o.r_target[0] + o.stop[0] * o.r_stop[0]
        return "both", float(mean)
    hit: Actual = "target" if o.target[0] == 1.0 else "stop"
    return hit, float(o.r_target[0] if hit == "target" else o.r_stop[0])


def plan(
    frame: BarFrame, origin: int, entry: float, target: float, stop: float, h: int
) -> Plan | None:
    """The plan made at bar ``origin`` (prices; side from the target), from the bars up to it;
    bars after it (if any) give the actual outcome. None if there are too few paths."""
    side: Side = "long" if target > entry else "short"
    past = frame.take(slice(0, origin + 1))
    sigma_all = unit_volatility(past)
    sigma = float(sigma_all[-1])
    if not math.isfinite(sigma) or sigma <= 0:
        return None
    paths = oriented_paths(history_paths(past, sigma_all, h), side)
    if len(paths.start) < MIN_PATHS:
        return None
    base = float(past.close[-1])
    e, t, s = orient(side, *(math.log(x / base) for x in (entry, target, stop)))
    sign = 1 if side == "long" else -1
    summary = summarise(simulate(paths, sigma, e, t, s, sign), abs(entry - stop) / entry)
    r = hv.returns(past)[1:] / sigma_all[:-1]
    r = r[np.isfinite(r)]
    drift = float(r.mean()) * sigma * sign if len(r) else 0.0
    actual, actual_r = _actual(frame, origin, h, side, (e, t, s))
    return Plan(
        side=side,
        h=h,
        sigma=sigma,
        summary=summary,
        heat=_grid_ev(paths, sigma, e, h, sign),
        multiples=MULTIPLES,
        reference=brownian_reference(drift, sigma, t - e, e - s),
        calibration=calibrate(paths, origin, h),
        actual=actual,
        actual_r=actual_r,
    )
