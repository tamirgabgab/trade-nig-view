r"""Golden models: independent scalar-loop implementations of the Pine semantics.

Written for clarity, not speed, and deliberately sharing no code with ``app.indicators``: a bug in
the vectorised code cannot hide in a shared helper. Each follows docs/TRADINGVIEW_RESEARCH.md
section 5 literally (``NaN`` = Pine ``na``).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

NAN = math.nan


def golden_sma(x: Sequence[float], n: int) -> list[float]:
    out: list[float] = []
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
            continue
        total = 0.0
        for k in range(n):
            total += x[t - k]
        out.append(total / n)
    return out


def golden_wma(x: Sequence[float], n: int) -> list[float]:
    denominator = n * (n + 1) / 2
    out: list[float] = []
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
            continue
        total = 0.0
        for k in range(n):
            total += (n - k) * x[t - k]
        out.append(total / denominator)
    return out


def _seeded_recursion(x: Sequence[float], n: int, alpha: float) -> list[float]:
    """y = SMA of the first n inputs at bar n-1, then y += alpha * (x - y)."""
    out: list[float] = []
    previous = NAN
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
        elif t == n - 1:
            previous = sum(x[:n]) / n
            out.append(previous)
        else:
            previous = alpha * x[t] + (1 - alpha) * previous
            out.append(previous)
    return out


def golden_ema(x: Sequence[float], n: int) -> list[float]:
    return _seeded_recursion(x, n, 2 / (n + 1))


def golden_rma(x: Sequence[float], n: int) -> list[float]:
    return _seeded_recursion(x, n, 1 / n)


def golden_source(
    name: str,
    o: Sequence[float],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
) -> list[float]:
    formulas: dict[str, Callable[[int], float]] = {
        "close": lambda i: c[i],
        "open": lambda i: o[i],
        "high": lambda i: h[i],
        "low": lambda i: lo[i],
        "hl2": lambda i: (h[i] + lo[i]) / 2,
        "hlc3": lambda i: (h[i] + lo[i] + c[i]) / 3,
        "ohlc4": lambda i: (o[i] + h[i] + lo[i] + c[i]) / 4,
        "hlcc4": lambda i: (h[i] + lo[i] + 2 * c[i]) / 4,
    }
    return [formulas[name](i) for i in range(len(c))]


def golden_shift(y: Sequence[float], offset: int) -> list[float]:
    return [NAN] * min(offset, len(y)) + list(y[: max(len(y) - offset, 0)])


def _first_finite(x: Sequence[float]) -> int:
    for i, value in enumerate(x):
        if not math.isnan(value):
            return i
    return len(x)


def golden_ema_of(x: Sequence[float], n: int) -> list[float]:
    """EMA of a series that may start with ``NaN`` (a cascaded EMA): the SMA seed is taken over
    the first ``n`` finite values."""
    f = _first_finite(x)
    head = [NAN] * min(f, len(x))
    return head + golden_ema(list(x[f:]), n)


def _combine(weights: Sequence[float], series: Sequence[Sequence[float]]) -> list[float]:
    out: list[float] = []
    for t in range(len(series[0])):
        values = [s[t] for s in series]
        if any(math.isnan(v) for v in values):
            out.append(NAN)
        else:
            out.append(sum(w * v for w, v in zip(weights, values, strict=True)))
    return out


def golden_dema(x: Sequence[float], n: int) -> list[float]:
    e1 = golden_ema(x, n)
    return _combine((2.0, -1.0), (e1, golden_ema_of(e1, n)))


def golden_tema(x: Sequence[float], n: int) -> list[float]:
    e1 = golden_ema(x, n)
    e2 = golden_ema_of(e1, n)
    return _combine((3.0, -3.0, 1.0), (e1, e2, golden_ema_of(e2, n)))


def golden_hma(x: Sequence[float], n: int) -> list[float]:
    half = n // 2
    root = math.floor(math.sqrt(n))
    raw = _combine((2.0, -1.0), (golden_wma(x, half), golden_wma(x, n)))
    return golden_wma(raw, root)


def golden_lsma(x: Sequence[float], n: int, offset: int = 0) -> list[float]:
    """Ordinary least squares on (j, x) for j = 0..n-1 in each window, evaluated at
    ``n - 1 - offset``."""
    out: list[float] = []
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
            continue
        window = x[t - n + 1 : t + 1]
        if n == 1:
            out.append(window[0])
            continue
        mean_j = (n - 1) / 2
        mean_y = sum(window) / n
        sxy = sum((j - mean_j) * (y - mean_y) for j, y in enumerate(window))
        sxx = sum((j - mean_j) ** 2 for j in range(n))
        slope = sxy / sxx
        intercept = mean_y - slope * mean_j
        out.append(intercept + slope * (n - 1 - offset))
    return out


def golden_alma(
    x: Sequence[float], n: int, offset: float = 0.85, sigma: float = 6.0, floor: bool = False
) -> list[float]:
    """Pine's ``ta.alma`` loop: weight of ``x[t - (n-1-j)]`` is ``exp(-(j-m)^2 / (2 s^2))``."""
    m = offset * (n - 1)
    if floor:
        m = math.floor(m)
    s = n / sigma
    out: list[float] = []
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
            continue
        norm = 0.0
        total = 0.0
        for j in range(n):
            weight = math.exp(-((j - m) ** 2) / (2 * s * s))
            norm += weight
            total += x[t - (n - 1 - j)] * weight
        out.append(total / norm)
    return out


def golden_swma(x: Sequence[float]) -> list[float]:
    return [
        NAN if t < 3 else (x[t - 3] + 2 * x[t - 2] + 2 * x[t - 1] + x[t]) / 6 for t in range(len(x))
    ]


def golden_vwma(x: Sequence[float], volume: Sequence[float], n: int) -> list[float]:
    out: list[float] = []
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
            continue
        weighted = sum(x[t - k] * volume[t - k] for k in range(n))
        total = sum(volume[t - k] for k in range(n))
        out.append(weighted / total if total > 0 else NAN)
    return out


def golden_mcginley(x: Sequence[float], n: int) -> list[float]:
    """Pine: ``mg := na(mg[1]) ? ta.ema(src, n) : mg[1] + (src - mg[1]) / (n * pow(src/mg[1], 4))``
    with division by zero = ``na`` and overflow = inf, plus ChartLab's rule that a level <= 0 is
    replaced by the EMA."""
    seed = golden_ema(x, n)
    out: list[float] = []
    previous = NAN
    for t in range(len(x)):
        if math.isnan(previous):
            current = seed[t]
        else:
            try:
                ratio4 = (x[t] / previous) ** 4
            except OverflowError:  # Pine: inf, so the step is 0
                ratio4 = math.inf
            try:
                current = previous + (x[t] - previous) / (n * ratio4)
            except ZeroDivisionError:
                current = NAN
            if current <= 0:  # ChartLab: a non-positive level falls back to the EMA
                current = seed[t]
        out.append(current)
        previous = current
    return out


def golden_kama(x: Sequence[float], n: int, fast: int = 2, slow: int = 30) -> list[float]:
    """TA-Lib ``KAMA``: seed ``x[n-1]``, first value at bar ``n``."""
    f = 2 / (fast + 1)
    s = 2 / (slow + 1)
    out: list[float] = [NAN] * min(n, len(x))
    level = x[n - 1] if n - 1 < len(x) else NAN
    for t in range(n, len(x)):
        change = abs(x[t] - x[t - n])
        noise = sum(abs(x[t - i] - x[t - i - 1]) for i in range(n))
        ratio = 1.0 if noise == 0 or noise <= change else change / noise
        rate = (ratio * (f - s) + s) ** 2
        level = level + rate * (x[t] - level)
        out.append(level)
    return out


def golden_t3(x: Sequence[float], n: int, v: float = 0.7) -> list[float]:
    """TA-Lib ``T3``: six cascaded EMAs combined with Tillson's coefficients (each EMA seeded
    with the SMA of its input's first ``n`` finite values)."""
    e: list[list[float]] = []
    level: Sequence[float] = x
    for _ in range(6):
        level = golden_ema_of(level, n)
        e.append(level)
    c1 = -(v**3)
    c2 = 3 * v**2 + 3 * v**3
    c3 = -6 * v**2 - 3 * v - 3 * v**3
    c4 = 1 + 3 * v + v**3 + 3 * v**2
    return _combine((c1, c2, c3, c4), (e[5], e[4], e[3], e[2]))


def golden_zlema(x: Sequence[float], n: int) -> list[float]:
    d = (n - 1) // 2
    momentum = [NAN if t < d else 2 * x[t] - x[t - d] for t in range(len(x))]
    return golden_ema_of(momentum, n)


def golden_crosses(fast: Sequence[float], slow: Sequence[float]) -> list[float]:
    """Pine ``ta.crossover`` (+1) / ``ta.crossunder`` (-1) of ``fast`` and ``slow``, else na."""
    out: list[float] = [NAN]
    for t in range(1, len(fast)):
        now = (fast[t], slow[t])
        before = (fast[t - 1], slow[t - 1])
        if any(math.isnan(v) for v in (*now, *before)):
            out.append(NAN)
        elif now[0] > now[1] and before[0] <= before[1]:
            out.append(1.0)
        elif now[0] < now[1] and before[0] >= before[1]:
            out.append(-1.0)
        else:
            out.append(NAN)
    return out[: len(fast)]


def golden_vwma_type(x: Sequence[float], n: int, volume: Sequence[float]) -> list[float]:
    return golden_vwma(x, volume, n)


GoldenMa = Callable[[Sequence[float], int, Sequence[float]], list[float]]

#: Golden model of every ``MA_TYPES`` entry as ``(x, n, volume) -> y`` (extra inputs at their
#: defaults, as in ``apply_ma``).
GOLDEN_MA: dict[str, GoldenMa] = {
    "sma": lambda x, n, _v: golden_sma(x, n),
    "ema": lambda x, n, _v: golden_ema(x, n),
    "wma": lambda x, n, _v: golden_wma(x, n),
    "smma": lambda x, n, _v: golden_rma(x, n),
    "dema": lambda x, n, _v: golden_dema(x, n),
    "tema": lambda x, n, _v: golden_tema(x, n),
    "hma": lambda x, n, _v: golden_hma(x, n),
    "lsma": lambda x, n, _v: golden_lsma(x, n),
    "alma": lambda x, n, _v: golden_alma(x, n),
    "swma": lambda x, _n, _v: golden_swma(x),
    "vwma": golden_vwma_type,
    "mcginley": lambda x, n, _v: golden_mcginley(x, n),
    "kama": lambda x, n, _v: golden_kama(x, n),
    "t3": lambda x, n, _v: golden_t3(x, n),
    "zlema": lambda x, n, _v: golden_zlema(x, n),
}


# --- R3c: bands, oscillators, volatility and volume -------------------------------------------


def golden_ma_of(ma_type: str, x: Sequence[float], n: int, volume: Sequence[float]) -> list[float]:
    """Any ``GOLDEN_MA`` type on a series that starts with ``NaN``: the average starts at the
    first finite value, as on a fresh series (Pine: earlier ``na`` bars do not exist for it)."""
    f = _first_finite(x)
    return [NAN] * f + GOLDEN_MA[ma_type](list(x[f:]), n, list(volume[f:]))


def golden_stdev(x: Sequence[float], n: int) -> list[float]:
    """Population standard deviation of each window about its own mean (``NaN`` in the window
    gives ``NaN``)."""
    out: list[float] = []
    for t in range(len(x)):
        window = list(x[max(t - n + 1, 0) : t + 1])
        if t < n - 1 or any(math.isnan(v) for v in window):
            out.append(NAN)
            continue
        mean = sum(window) / n
        out.append(math.sqrt(sum((v - mean) ** 2 for v in window) / n))
    return out


def golden_bb(
    x: Sequence[float], volume: Sequence[float], ma_type: str, n: int, mult: float
) -> dict[str, list[float]]:
    basis = GOLDEN_MA[ma_type](x, n, volume)
    dev = golden_stdev(x, n)
    return {
        "basis": basis,
        "upper": [b + mult * d for b, d in zip(basis, dev, strict=True)],
        "lower": [b - mult * d for b, d in zip(basis, dev, strict=True)],
    }


def golden_rsi(x: Sequence[float], n: int) -> list[float]:
    """Pine ``ta.rsi``: RMA of gains and losses seeded with the SMA of the first ``n`` changes
    (bars 1..n), ``down == 0 ? 100 : up == 0 ? 0 : 100 - 100 / (1 + up / down)``."""
    out: list[float] = [NAN] * min(n, len(x))
    if len(x) <= n:
        return out
    gains = [max(x[t] - x[t - 1], 0.0) for t in range(1, len(x))]
    losses = [max(x[t - 1] - x[t], 0.0) for t in range(1, len(x))]
    up = sum(gains[:n]) / n
    down = sum(losses[:n]) / n
    for t in range(n, len(x)):
        if t > n:
            up = (1 / n) * gains[t - 1] + (1 - 1 / n) * up
            down = (1 / n) * losses[t - 1] + (1 - 1 / n) * down
        if down == 0:
            out.append(100.0)
        elif up == 0:
            out.append(0.0)
        else:
            out.append(100 - 100 / (1 + up / down))
    return out


def golden_macd(
    x: Sequence[float],
    volume: Sequence[float],
    fast: int,
    slow: int,
    signal: int,
    osc_type: str = "ema",
    signal_type: str = "ema",
) -> dict[str, list[float]]:
    line = _combine(
        (1.0, -1.0), (GOLDEN_MA[osc_type](x, fast, volume), GOLDEN_MA[osc_type](x, slow, volume))
    )
    sig = golden_ma_of(signal_type, line, signal, volume)
    return {"macd": line, "signal": sig, "hist": _combine((1.0, -1.0), (line, sig))}


def golden_stoch(
    h: Sequence[float], lo: Sequence[float], c: Sequence[float], n: int, sk: int, sd: int
) -> dict[str, list[float]]:
    raw: list[float] = []
    for t in range(len(c)):
        if t < n - 1:
            raw.append(NAN)
            continue
        hh = max(h[t - n + 1 : t + 1])
        ll = min(lo[t - n + 1 : t + 1])
        raw.append(NAN if hh == ll else 100 * (c[t] - ll) / (hh - ll))
    k = golden_sma(raw, sk)
    return {"k": k, "d": golden_sma(k, sd)}


def golden_true_range(h: Sequence[float], lo: Sequence[float], c: Sequence[float]) -> list[float]:
    out: list[float] = []
    for t in range(len(c)):
        if t == 0:
            out.append(h[0] - lo[0])
        else:
            out.append(max(h[t] - lo[t], abs(h[t] - c[t - 1]), abs(lo[t] - c[t - 1])))
    return out


def golden_obv(c: Sequence[float], volume: Sequence[float]) -> list[float]:
    out: list[float] = []
    level = 0.0
    for t in range(len(c)):
        if t > 0:
            if c[t] > c[t - 1]:
                level += volume[t]
            elif c[t] < c[t - 1]:
                level -= volume[t]
        out.append(level)
    return out


def golden_vwap(
    price: Sequence[float], volume: Sequence[float], session: Sequence[int]
) -> list[float]:
    out: list[float] = []
    weighted = total = 0.0
    for t in range(len(price)):
        if t == 0 or session[t] != session[t - 1]:
            weighted = total = 0.0
        weighted += price[t] * volume[t]
        total += volume[t]
        out.append(weighted / total if total > 0 else NAN)
    return out


# --- market structure (R5) ---------------------------------------------------------------------


def _period_key(epoch: int, period: str) -> tuple[int, ...]:
    moment = datetime.fromtimestamp(epoch, UTC)
    if period == "day":
        return (moment.year, moment.month, moment.day)
    if period == "week":
        iso = moment.isocalendar()
        return (iso.year, iso.week)
    return (moment.year, moment.month)


def golden_prev_hlc(
    time: Sequence[int],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
    period: str,
) -> tuple[list[float], list[float], list[float]]:
    """High, low, close of the previous period (UTC day / ISO week / month), bar by bar."""
    out_h: list[float] = []
    out_l: list[float] = []
    out_c: list[float] = []
    prev = (NAN, NAN, NAN)
    cur_key: tuple[int, ...] | None = None
    cur_h = cur_l = cur_c = NAN
    for t in range(len(time)):
        key = _period_key(time[t], period)
        if key != cur_key:
            if cur_key is not None:
                prev = (cur_h, cur_l, cur_c)
            cur_key, cur_h, cur_l = key, h[t], lo[t]
        else:
            cur_h, cur_l = max(cur_h, h[t]), min(cur_l, lo[t])
        cur_c = c[t]
        out_h.append(prev[0])
        out_l.append(prev[1])
        out_c.append(prev[2])
    return out_h, out_l, out_c


def golden_pivots(
    h: Sequence[float], lo: Sequence[float], left: int, right: int
) -> tuple[list[float], list[float]]:
    """Strict fractal pivots, stored at their confirmation bar t = p + right."""
    highs: list[float] = []
    lows: list[float] = []
    for t in range(len(h)):
        p = t - right
        if p < left:
            highs.append(NAN)
            lows.append(NAN)
            continue
        others = [j for j in range(p - left, p + right + 1) if j != p]
        highs.append(h[p] if all(h[p] > h[j] for j in others) else NAN)
        lows.append(lo[p] if all(lo[p] < lo[j] for j in others) else NAN)
    return highs, lows


@dataclass(slots=True)
class GoldenGap:
    index: int
    direction: str
    kind: str
    top: float
    bottom: float
    size_pct: float
    filled_index: int | None = None
    fill_price: float | None = None

    def see(self, k: int, high: float, low: float) -> None:
        """Bar k (after the gap bar) arrives: fill it or deepen the penetration."""
        if self.filled_index is not None:
            return
        if self.direction == "up":
            if low <= self.bottom:
                self.filled_index, self.fill_price = k, self.bottom
            elif low < self.top and (self.fill_price is None or low < self.fill_price):
                self.fill_price = low
        elif high >= self.top:
            self.filled_index, self.fill_price = k, self.top
        elif high > self.bottom and (self.fill_price is None or high > self.fill_price):
            self.fill_price = high


def _golden_zone(
    o: Sequence[float],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
    k: int,
    partial: bool,
) -> tuple[str, str, float, float] | None:
    """(direction, kind, top, bottom) of the gap at bar k >= 1, or None."""
    if lo[k] > h[k - 1]:
        return ("up", "full", lo[k], h[k - 1])
    if h[k] < lo[k - 1]:
        return ("down", "full", lo[k - 1], h[k])
    if partial and o[k] > c[k - 1]:
        return ("up", "partial", o[k], c[k - 1])
    if partial and o[k] < c[k - 1]:
        return ("down", "partial", c[k - 1], o[k])
    return None


def golden_gaps(
    o: Sequence[float],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
    min_pct: float,
    partial: bool,
) -> list[GoldenGap]:
    """Streaming gap tracker: at each bar, first update the open gaps, then detect a new one."""
    gaps: list[GoldenGap] = []
    for k in range(len(c)):
        for gap in gaps:
            gap.see(k, h[k], lo[k])
        zone = None if k == 0 else _golden_zone(o, h, lo, c, k, partial)
        if zone is None:
            continue
        direction, kind, top, bottom = zone
        size_pct = (top - bottom) / c[k - 1] * 100.0
        if size_pct >= min_pct:
            gap = GoldenGap(k, direction, kind, top, bottom, size_pct)
            # A partial gap's own bar overlaps the previous one: it can already trade into it.
            if kind == "partial":
                gap.see(k, h[k], lo[k])
            gaps.append(gap)
    return gaps


# --- historical volatility (V1) -----------------------------------------------------------------

YEAR_SECONDS = 365.25 * 86_400


def _mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def _var(xs: Sequence[float], ddof: int) -> float:
    m = _mean(xs)
    return sum((x - m) ** 2 for x in xs) / (len(xs) - ddof)


def golden_bar_terms(
    o: Sequence[float], h: Sequence[float], lo: Sequence[float], c: Sequence[float], t: int
) -> dict[str, float]:
    """The per-bar quantities of bar t (gap and return NaN on bar 0)."""
    prev = c[t - 1] if t > 0 else NAN
    hl = math.log(h[t] / lo[t])
    body = math.log(c[t] / o[t])
    return {
        "gap": math.log(o[t] / prev) if t > 0 else NAN,
        "ret": math.log(c[t] / prev) if t > 0 else NAN,
        "body": body,
        "parkinson": hl * hl / (4 * math.log(2)),
        "garman_klass": 0.5 * hl * hl - (2 * math.log(2) - 1) * body * body,
        "rogers_satchell": math.log(h[t] / c[t]) * math.log(h[t] / o[t])
        + math.log(lo[t] / c[t]) * math.log(lo[t] / o[t]),
    }


def golden_variance(
    o: Sequence[float],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
    estimator: str,
    n: int,
) -> list[float]:
    """Per-bar variance of the last n bars, one estimator, straight from the formulas."""
    rows = [golden_bar_terms(o, h, lo, c, t) for t in range(len(c))]
    out: list[float] = []
    for t in range(len(c)):
        window = rows[t - n + 1 : t + 1] if t >= n - 1 else []
        needs_previous = estimator in ("close", "yang_zhang")
        if not window or (needs_previous and t < n):
            out.append(NAN)
            continue
        match estimator:
            case "close":
                out.append(_var([r["ret"] for r in window], 0))
            case "yang_zhang":
                k = 0.34 / (1.34 + (n + 1) / (n - 1))
                out.append(
                    _var([r["gap"] for r in window], 1)
                    + k * _var([r["body"] for r in window], 1)
                    + (1 - k) * _mean([r["rogers_satchell"] for r in window])
                )
            case _:
                out.append(_mean([r[estimator] for r in window]))
    return out


def golden_bars_per_year(times: Sequence[int]) -> list[float]:
    """Bars with an open in (t - 1 year, t]; before a year, the bar rate so far times a year."""
    out: list[float] = []
    first = 0  # the oldest bar inside the year up to t
    for t, now in enumerate(times):
        while times[first] <= now - YEAR_SECONDS:
            first += 1
        elapsed = now - times[0]
        if elapsed >= YEAR_SECONDS:
            out.append(float(t - first + 1))
        elif elapsed > 0:
            out.append(t / (elapsed / YEAR_SECONDS))
        else:
            out.append(NAN)
    return out


def golden_hv(
    o: Sequence[float],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
    times: Sequence[int],
    estimator: str,
    n: int,
    annualize: bool,
) -> list[float]:
    per_year = golden_bars_per_year(times)
    out: list[float] = []
    for v, year in zip(golden_variance(o, h, lo, c, estimator, n), per_year, strict=True):
        sigma = math.sqrt(max(v, 0.0)) if not math.isnan(v) else NAN
        out.append(100 * sigma * (math.sqrt(year) if annualize else 1.0))
    return out


def golden_percentrank(x: Sequence[float], m: int) -> list[float]:
    """Pine ``ta.percentrank``: % of the previous m values <= the current one."""
    out: list[float] = []
    for t in range(len(x)):
        window: Sequence[float] = x[t - m : t] if t >= m else []
        if not window or math.isnan(x[t]) or any(math.isnan(v) for v in window):
            out.append(NAN)
            continue
        out.append(100 * sum(1 for v in window if v <= x[t]) / m)
    return out


def _linear_quantile(values: Sequence[float], p: float) -> float:
    """numpy's default quantile: linear between the order statistics at (n - 1) p."""
    v = sorted(values)
    h = (len(v) - 1) * p
    i = min(math.floor(h), len(v) - 2)
    return v[i] + (h - i) * (v[i + 1] - v[i])


def golden_var_bands(
    o: Sequence[float],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
    level: float,
    window: int,
    n: int,
) -> dict[str, list[float]]:
    """VaR bands for bar t + 1 from the standardised returns up to t; breaches on t + 1."""
    sigma = [
        math.sqrt(max(v, 0.0)) if not math.isnan(v) else NAN
        for v in golden_variance(o, h, lo, c, "yang_zhang", n)
    ]
    z = [NAN] + [
        math.log(c[t] / c[t - 1]) / sigma[t - 1]
        if not math.isnan(sigma[t - 1]) and sigma[t - 1] > 0
        else NAN
        for t in range(1, len(c))
    ]
    upper, lower, breaches = [NAN] * len(c), [NAN] * len(c), [NAN] * len(c)
    for t in range(window - 1, len(c) - 1):
        w = z[t - window + 1 : t + 1]
        if any(math.isnan(x) for x in w):
            continue
        lower[t + 1] = c[t] * math.exp(sigma[t] * _linear_quantile(w, 1 - level))
        upper[t + 1] = c[t] * math.exp(sigma[t] * _linear_quantile(w, level))
        if c[t + 1] > upper[t + 1]:
            breaches[t + 1] = 1.0
        elif c[t + 1] < lower[t + 1]:
            breaches[t + 1] = -1.0
    return {"upper": upper, "lower": lower, "breaches": breaches}


# --- regime (G1) --------------------------------------------------------------------------------


def golden_vr_z(close: Sequence[float], w: int, qs: Sequence[int] = (2, 4, 8, 16)) -> list[float]:
    """Signed Chow-Denning statistic over the last w log returns, straight from the formulas."""
    r = [NAN] + [math.log(close[t] / close[t - 1]) for t in range(1, len(close))]
    out: list[float] = []
    for t in range(len(close)):
        if t < w:
            out.append(NAN)
            continue
        x = r[t - w + 1 : t + 1]
        n = len(x)
        mu = sum(x) / n
        d = [v - mu for v in x]
        ss = sum(v * v for v in d)
        var1 = ss / (n - 1)
        best = NAN
        for q in qs:
            sums = [sum(x[k - j] for j in range(q)) for k in range(q - 1, n)]
            m = q * (n - q + 1) * (1 - q / n)
            varq = sum((s - q * mu) ** 2 for s in sums) / m
            vr = varq / var1
            theta = 0.0
            for j in range(1, q):
                delta = n * sum(d[k] ** 2 * d[k - j] ** 2 for k in range(j, n)) / ss**2
                theta += (2 * (q - j) / q) ** 2 * delta
            z = math.sqrt(n) * (vr - 1) / math.sqrt(theta)
            if math.isnan(best) or abs(z) > abs(best):
                best = z
        out.append(best)
    return out


def golden_dfa(
    close: Sequence[float], w: int, scales: Sequence[int] = (8, 16, 32, 64)
) -> list[float]:
    """DFA Hurst over the last w returns: the window's own profile, boxes from its end, a line
    fitted in each box by least squares. Undefined (NaN) when the window's returns are equal to
    within 1e-6 of their mean (population std): a straight-line profile has nothing to scale."""
    r = [NAN] + [math.log(close[t] / close[t - 1]) for t in range(1, len(close))]
    used = [s for s in scales if s <= w // 4]
    out: list[float] = []
    for t in range(len(close)):
        if t < w:
            out.append(NAN)
            continue
        x = r[t - w + 1 : t + 1]
        mu = sum(x) / w
        if math.sqrt(sum((v - mu) ** 2 for v in x) / w) <= 1e-6 * abs(mu):
            out.append(NAN)
            continue
        profile: list[float] = []
        acc = 0.0
        for v in x:
            acc += v - mu
            profile.append(acc)
        logs: list[tuple[float, float]] = []
        for s in used:
            nb = w // s
            total = 0.0
            for b in range(nb):
                box = profile[w - (b + 1) * s : w - b * s]
                xi = [i - (s - 1) / 2 for i in range(s)]
                ym = sum(box) / s
                sxy = sum(a * (y - ym) for a, y in zip(xi, box, strict=True))
                sxx = sum(a * a for a in xi)
                total += sum((y - ym) ** 2 for y in box) - sxy * sxy / sxx
            logs.append((math.log(s), 0.5 * math.log(total / (nb * s))))
        lx = sum(a for a, _ in logs) / len(logs)
        ly = sum(b for _, b in logs) / len(logs)
        out.append(sum((a - lx) * (b - ly) for a, b in logs) / sum((a - lx) ** 2 for a, _ in logs))
    return out
