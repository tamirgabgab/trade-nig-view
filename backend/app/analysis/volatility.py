r"""The volatility cone and the volatility engine (P3, round V1; ADR 0011).

Everything is per bar and from bars up to the origin (the last bar, or the replay cursor). The
estimators are ``app.indicators.hv``'s (one implementation for the chart and this tab).

**Horizons** are calendar spans (a week, a month, a quarter, half a year, a year) turned into
bars with the series' own bars per year :math:`N`: :math:`h = \operatorname{round}(N d / 365.25)`;
spans under two bars are dropped.

**Cone.** For each horizon, the estimator over every h-bar window of the history (overlapping),
its percentiles, today's value and its rank among them. Today's value has an approximate 95 %
interval from the per-bar terms :math:`x_i` it averages: on the log scale,
:math:`\ln\hat v \pm 1.96\,\frac{s_x}{\sqrt h\,\hat v}`.

**Forecast (HAR).** Per horizon, a direct regression of the log of the estimator's mean per-bar
term over the next h bars on the log mean of the range proxy :math:`q = o^2 + \text{GK}` over the
last 1, 5, 22 and (for a longer horizon) h bars (:math:`\ln y_{t,h} = c + b_1 \ln\bar q_{t,1} +
b_5 \ln\bar q_{t,5} + b_{22}\ln\bar q_{t,22} + b_h \ln\bar q_{t,h}`: the last term nests the
naive forecast, which slow regimes favour), trained on the pairs whose outcome ends by the
origin, and only with at least 30 non-overlapping targets. The 10 / 50 / 90 %
band adds the residuals' quantiles. A walk-forward check over the last 500 origins (refit every 20)
gives the coverage of the 80 % band and the QLIKE loss against the naive forecast "the next h bars
as the last h".

**QLIKE** :math:`= y/f - \ln(y/f) - 1`, with :math:`f` a variance forecast and :math:`y` the
realised one (mean squared close-to-close return over the next h bars, or the 1h realised
variance): the loss that ranks variance forecasts correctly with a noisy proxy (Patton, 2011).

**Squeeze.** At every past bar s with an outcome: the rank of the h-bar volatility among the
previous year of values (``hv_percentile``); an event is a rank :math:`\le p`; it expands when the
volatility of the next h bars is at least :math:`f` times today's. P(expand | squeeze) against the
base rate P(expand), with a Wilson 95 % interval over the events at least h bars apart (the
overlapping ones are not independent), and the absolute h-bar return after the events.

**Decomposition.** The overnight share :math:`s_o^2/(s_o^2 + s_c^2)` (gaps against bodies) and the
downside share :math:`\sum_{r<0} r^2 / \sum r^2`, over the last h bars and the whole history.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt
from numpy.lib.stride_tricks import sliding_window_view

from app.indicators import hv
from app.indicators.hv_percentile import percent_rank
from app.models.bars import BarFrame, FloatArray

Matrix = npt.NDArray[np.float64]
Label = Literal["week", "month", "quarter", "half", "year"]

#: Calendar horizons: label -> days.
SPANS: dict[Label, float] = {
    "week": 7.0,
    "month": 365.25 / 12,
    "quarter": 365.25 / 4,
    "half": 365.25 / 2,
    "year": 365.25,
}
PERCENTILES: tuple[float, ...] = (0.0, 10.0, 25.0, 50.0, 75.0, 90.0, 100.0)
BAND = (0.1, 0.5, 0.9)
HAR = (1, 5, 22)
EVALUATE = 500
REFIT = 20
MIN_TRAIN = 60
#: Fewest non-overlapping training targets (rows / h) a horizon's HAR needs: the overlapping
#: h-bar targets of a short history hold only a few independent outcomes, and a regression on them
#: extrapolates one regime into the next.
MIN_INDEPENDENT = 30
#: Fewest h-bar windows a horizon needs to be shown.
MIN_WINDOWS = 20
FLOOR = 1e-12
Z95 = 1.959963984540054


@dataclass(frozen=True, slots=True)
class Forecast:
    """Per-bar volatility over the next h bars: 10 / 50 / 90 % (from the HAR regression)."""

    low: float
    median: float
    high: float
    #: Walk-forward: share of outcomes inside the 80 % band; QLIKE of HAR and of the naive one.
    coverage: float | None
    qlike: float | None
    qlike_naive: float | None


@dataclass(frozen=True, slots=True)
class Horizon:
    label: Label
    bars: int
    current: float  # per-bar volatility over the last h bars
    ci: tuple[float, float]
    percentiles: tuple[float, ...]
    rank: float  # % of the history's h-bar windows <= today's
    forecast: Forecast | None


@dataclass(frozen=True, slots=True)
class Squeeze:
    horizon: Label
    bars: int
    threshold: float
    factor: float
    rank: float  # today's rank among the previous year (NaN before a year)
    active: bool
    events: int
    independent: int
    p: float
    ci: tuple[float, float]
    base_rate: float
    #: Median and 80th percentile of |ln C_{s+h} / C_s| after the events and after every bar.
    move_events: tuple[float, float]
    move_all: tuple[float, float]


@dataclass(frozen=True, slots=True)
class EstimatorScore:
    estimator: str  # an hv estimator, "har" or "realized"
    n: int
    qlike: float
    #: Volatility of the estimator over the realised (1h) one, median over the windows.
    bias: float | None


@dataclass(frozen=True, slots=True)
class Shares:
    window: float
    history: float


@dataclass(frozen=True, slots=True)
class Cone:
    estimator: str
    bars_per_year: float
    horizons: tuple[Horizon, ...]
    squeeze: Squeeze | None
    overnight: Shares
    downside: Shares
    scores: tuple[EstimatorScore, ...]
    #: The horizon the squeeze, the shares and the scores use.
    main: Horizon


# --- helpers ------------------------------------------------------------------------------------


def horizon_bars(bars_per_year: float) -> dict[Label, int]:
    """Label -> bars, for the spans of at least two bars (each length once, shortest label)."""
    out: dict[Label, int] = {}
    for label, days in SPANS.items():
        h = round(bars_per_year * days / 365.25)
        if h >= hv.MIN_WINDOW and h not in out.values():
            out[label] = h
    return out


def terms(frame: BarFrame, estimator: str) -> FloatArray:
    """Per-bar variance terms of an estimator, undemeaned (Yang-Zhang: the proxy q), whose mean
    over the next h bars is the HAR target."""
    match estimator:
        case "close":
            return hv.returns(frame) ** 2
        case "parkinson":
            return hv.parkinson_terms(frame)
        case "garman_klass":
            return hv.garman_klass_terms(frame)
        case "rogers_satchell":
            return hv.rogers_satchell_terms(frame)
        case _:  # yang_zhang: gap + body with the weights of the estimator for a long window
            return proxy(frame)


def proxy(frame: BarFrame) -> FloatArray:
    """:math:`q = o^2 + \\text{GK}`: a per-bar variance with the gap (NaN on bar 0)."""
    return hv.gaps(frame) ** 2 + hv.garman_klass_terms(frame)


def forward_mean(x: FloatArray, h: int) -> FloatArray:
    """Mean of x over bars t+1..t+h (NaN where the window leaves the data)."""
    out = np.full(len(x), np.nan)
    if len(x) > h:
        out[: len(x) - h] = sliding_window_view(x[1:], h).mean(axis=1)
    return out


def trailing_mean(x: FloatArray, h: int) -> FloatArray:
    out = np.full(len(x), np.nan)
    if len(x) >= h:
        out[h - 1 :] = sliding_window_view(x, h).mean(axis=1)
    return out


def qlike(realised: FloatArray, forecast: FloatArray) -> float:
    ratio = realised / forecast
    return float(np.mean(ratio - np.log(ratio) - 1))


def wilson(hits: float, n: int) -> tuple[float, float]:
    """95 % Wilson interval of a proportion ``hits / n`` (hits may be fractional)."""
    if n == 0:
        return (math.nan, math.nan)
    p = hits / n
    z2 = Z95 * Z95
    centre = (p + z2 / (2 * n)) / (1 + z2 / n)
    half = Z95 * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / (1 + z2 / n)
    return (max(0.0, centre - half), min(1.0, centre + half))


def spaced(index: npt.NDArray[np.int64], gap: int) -> int:
    """How many of the sorted ``index`` remain when each kept one is at least ``gap`` after the
    previous kept one."""
    count, last = 0, -gap
    for i in index.tolist():
        if i - last >= gap:
            count, last = count + 1, i
    return count


# --- HAR ----------------------------------------------------------------------------------------


def har_features(frame: BarFrame, h: int) -> Matrix:
    """1 and the log mean of q over the last 1, 5, 22 and (if longer) h bars."""
    q = np.maximum(proxy(frame), FLOOR)
    lengths = (*HAR, h) if h > max(HAR) else HAR
    cols = [np.log(trailing_mean(q, m)) for m in lengths]
    return np.column_stack([np.ones(len(q)), *cols])


def har_target(frame: BarFrame, estimator: str, h: int) -> FloatArray:
    """Log mean of the estimator's per-bar terms over the next h bars."""
    return np.log(np.maximum(forward_mean(terms(frame, estimator), h), FLOOR))


def har_fit(x: Matrix, y: FloatArray, h: int, origin: int) -> tuple[FloatArray, FloatArray] | None:
    """Coefficients and residuals on the rows s with s + h <= origin."""
    rows = np.arange(len(y)) <= origin - h
    rows &= np.isfinite(y) & np.isfinite(x).all(axis=1)
    if rows.sum() < max(MIN_TRAIN, MIN_INDEPENDENT * h):
        return None
    beta = np.linalg.lstsq(x[rows], y[rows], rcond=None)[0]
    return beta, y[rows] - x[rows] @ beta


def walk_forward(x: Matrix, y: FloatArray, h: int, origin: int) -> Matrix:
    """n x 3 over the last EVALUATE origins s with s + h <= ``origin`` (refit every REFIT bars on
    the pairs that end by s): the log 10 and 90 % bounds and the mean variance forecast; NaN
    elsewhere."""
    out = np.full((len(y), 3), np.nan)
    model: tuple[FloatArray, float, float, float] | None = None
    for k, s in enumerate(range(max(0, origin - h - EVALUATE + 1), origin - h + 1)):
        if k % REFIT == 0:
            fit = har_fit(x, y, h, s)
            if fit is None:
                model = None
            else:
                beta, resid = fit
                lo, hi = np.quantile(resid, (BAND[0], BAND[2]))
                model = (beta, float(lo), float(hi), float(np.mean(np.exp(resid))))
        if model is None or not np.isfinite(x[s]).all():
            continue
        beta, lo, hi, smear = model
        centre = float(x[s] @ beta)
        out[s] = (centre + lo, centre + hi, math.exp(centre) * smear)
    return out


def har_forecast(
    x: Matrix, y: FloatArray, wf: Matrix, naive: FloatArray, h: int, origin: int
) -> Forecast | None:
    """The band at ``origin`` and its walk-forward check (``wf``) against the estimator's own
    outcome (variances in, per-bar volatilities out)."""
    fit = har_fit(x, y, h, origin)
    if fit is None or not np.isfinite(x[origin]).all():
        return None
    beta, resid = fit
    centre = float(x[origin] @ beta)
    low, median, high = (math.sqrt(math.exp(centre + float(np.quantile(resid, b)))) for b in BAND)
    real = np.exp(y)
    ok = np.isfinite(wf).all(axis=1) & np.isfinite(y) & np.isfinite(naive) & (naive > 0)
    if ok.sum() < MIN_WINDOWS:
        return Forecast(low, median, high, None, None, None)
    return Forecast(
        low,
        median,
        high,
        coverage=float(np.mean((wf[ok, 0] <= y[ok]) & (y[ok] <= wf[ok, 1]))),
        qlike=qlike(real[ok], wf[ok, 2]),
        qlike_naive=qlike(real[ok], naive[ok]),
    )


# --- the cone -----------------------------------------------------------------------------------


def _ci_terms(frame: BarFrame, estimator: str, h: int) -> FloatArray:
    """The h per-bar terms whose mean is (about) the estimator over the last h bars."""
    tail = frame.take(slice(len(frame) - h - 1, None))
    match estimator:
        case "close":
            r = hv.returns(tail)[1:]
            return (r - r.mean()) ** 2
        case "yang_zhang":
            o, c = hv.gaps(tail)[1:], hv.bodies(tail)[1:]
            k, scale = hv.yz_weight(h), h / (h - 1)
            rs = hv.rogers_satchell_terms(tail)[1:]
            return scale * (o - o.mean()) ** 2 + k * scale * (c - c.mean()) ** 2 + (1 - k) * rs
        case _:
            return terms(tail, estimator)[1:]


def _current_ci(frame: BarFrame, estimator: str, h: int, v: float) -> tuple[float, float]:
    x = _ci_terms(frame, estimator, h)
    if v <= 0 or not np.isfinite(x).all():
        return (math.nan, math.nan)
    half = Z95 * float(np.std(x, ddof=1)) / math.sqrt(h) / v
    return (math.sqrt(v * math.exp(-half)), math.sqrt(v * math.exp(half)))


def _squeeze(
    frame: BarFrame,
    estimator: str,
    label: Label,
    h: int,
    year: int,
    threshold: float,
    factor: float,
) -> Squeeze | None:
    v = hv.rolling_variance(frame, estimator, h)
    rank = percent_rank(v, year)
    later = np.concatenate((v[h:], np.full(h, np.nan)))  # v over bars s+1..s+h
    c = frame.close
    move = np.full(len(c), np.nan)
    move[: len(c) - h] = np.abs(np.log(c[h:] / c[:-h]))
    valid = np.isfinite(rank) & np.isfinite(later) & (v > 0)
    if valid.sum() < MIN_WINDOWS:
        return None
    expand = later[valid] >= factor * factor * v[valid]
    event = rank[valid] <= threshold
    index = np.flatnonzero(valid)[event]
    events = int(event.sum())
    independent = spaced(index, h)
    p = float(expand[event].mean()) if events else math.nan
    moves = move[valid]

    def stats(m: FloatArray) -> tuple[float, float]:
        return (float(np.median(m)), float(np.quantile(m, 0.8))) if len(m) else (math.nan, math.nan)

    now = float(rank[-1])
    return Squeeze(
        horizon=label,
        bars=h,
        threshold=threshold,
        factor=factor,
        rank=now,
        active=bool(now <= threshold),
        events=events,
        independent=independent,
        p=p,
        ci=wilson(p * independent, independent) if events else (math.nan, math.nan),
        base_rate=float(expand.mean()),
        move_events=stats(moves[event]),
        move_all=stats(moves),
    )


def _share(top: float, other: float) -> float:
    total = top + other
    return top / total if total > 0 else math.nan


def _shares(frame: BarFrame, h: int) -> tuple[Shares, Shares]:
    o, c, r = hv.gaps(frame)[1:], hv.bodies(frame)[1:], hv.returns(frame)[1:]

    def overnight(oo: FloatArray, cc: FloatArray) -> float:
        return _share(float(np.var(oo)), float(np.var(cc)))

    def downside(rr: FloatArray) -> float:
        return _share(float(np.sum(rr[rr < 0] ** 2)), float(np.sum(rr[rr >= 0] ** 2)))

    return (
        Shares(overnight(o[-h:], c[-h:]), overnight(o, c)),
        Shares(downside(r[-h:]), downside(r)),
    )


def _scores(
    frame: BarFrame,
    estimator_forecasts: dict[str, FloatArray],
    h: int,
    realised_1h: FloatArray | None,
) -> tuple[EstimatorScore, ...]:
    """QLIKE of every forecast over the last EVALUATE origins with an outcome (and a 1h realised
    variance, if given), against the mean squared return of the next h bars."""
    realised = forward_mean(hv.returns(frame) ** 2, h)
    n = len(frame)
    window = np.zeros(n, dtype=bool)
    window[max(0, n - h - EVALUATE) : max(0, n - h)] = True
    ok = window & np.isfinite(realised) & (realised > 0)
    # A forecast that never exists in the window (HAR on a short history) is left out, not the
    # whole table; the others are scored on the same origins.
    estimator_forecasts = {
        k: f for k, f in estimator_forecasts.items() if (ok & np.isfinite(f)).sum() >= MIN_WINDOWS
    }
    for f in estimator_forecasts.values():
        ok &= np.isfinite(f) & (f > 0)
    rv_past = None
    if realised_1h is not None:
        rv_past = trailing_mean(realised_1h, h)
        ok &= np.isfinite(rv_past) & (rv_past > 0)
    if ok.sum() < MIN_WINDOWS:
        if realised_1h is None:
            return ()
        # Too few days with 1h bars: score the daily estimators without the realised variance.
        rest = {k: f for k, f in estimator_forecasts.items() if k != "realized"}
        return _scores(frame, rest, h, None)
    out: list[EstimatorScore] = []
    for name, f in estimator_forecasts.items():
        bias = None
        if rv_past is not None and name != "realized":
            bias = float(np.median(np.sqrt(f[ok] / rv_past[ok])))
        out.append(EstimatorScore(name, int(ok.sum()), qlike(realised[ok], f[ok]), bias))
    return tuple(sorted(out, key=lambda s: s.qlike))


def realized_from_hourly(daily: BarFrame, hourly: BarFrame) -> FloatArray:
    """Per daily bar: the sum of the squared 1h close-to-close log returns of its session (the
    first one includes the overnight gap); NaN on days without 1h bars, and on a day whose first
    return does not start at the previous daily bar's session (missing 1h sessions in between
    would load several days of moves onto it)."""
    day = daily.time // 86_400
    if hourly.session is None or len(hourly) < hv.MIN_WINDOW:
        return np.full(len(daily), np.nan)
    r2 = np.log(hourly.close[1:] / hourly.close[:-1]) ** 2
    before, after = hourly.session[:-1], hourly.session[1:]
    unique, start = np.unique(after, return_index=True)
    sums = np.add.reduceat(r2, start)
    previous = dict(zip(day[1:].tolist(), day[:-1].tolist(), strict=True))
    # The first session in the data has no previous close for its first bar: it is dropped too.
    broken = {
        int(a)
        for a, b in zip(after[start].tolist(), before[start].tolist(), strict=True)
        if a == b or previous.get(a) != b
    }
    lookup = {
        d: total for d, total in zip(unique.tolist(), sums.tolist(), strict=True) if d not in broken
    }
    return np.array([lookup.get(d, np.nan) for d in day.tolist()], dtype=np.float64)


def cone(
    frame: BarFrame,
    estimator: str = "yang_zhang",
    squeeze_horizon: Label = "month",
    threshold: float = 10.0,
    factor: float = 1.5,
    realised_1h: FloatArray | None = None,
) -> Cone | None:
    """The cone of ``frame`` at its last bar (None if no horizon has enough history)."""
    n = len(frame)
    if n < hv.MIN_WINDOW + 1:
        return None
    per_year = float(hv.bars_per_year(frame.time)[-1])
    spans = horizon_bars(per_year)
    horizons: list[Horizon] = []
    har_walk: dict[int, FloatArray] = {}  # h -> walk-forward mean variance forecasts
    for label, h in spans.items():
        v = hv.rolling_variance(frame, estimator, h)
        values = np.sqrt(np.maximum(v[np.isfinite(v)], 0.0))
        if len(values) < MIN_WINDOWS or not np.isfinite(v[-1]):
            continue
        now = math.sqrt(max(float(v[-1]), 0.0))
        x, y = har_features(frame, h), har_target(frame, estimator, h)
        wf = walk_forward(x, y, h, n - 1)
        har_walk[h] = wf[:, 2]
        forecast = har_forecast(x, y, wf, v, h, n - 1)
        horizons.append(
            Horizon(
                label=label,
                bars=h,
                current=now,
                ci=_current_ci(frame, estimator, h, float(v[-1])),
                percentiles=tuple(float(p) for p in np.percentile(values, PERCENTILES)),
                rank=float(100 * np.mean(values <= now)),
                forecast=forecast,
            )
        )
    if not horizons:
        return None
    main = next((hz for hz in horizons if hz.label == squeeze_horizon), horizons[0])
    year = max(round(per_year), hv.MIN_WINDOW)
    squeeze = _squeeze(frame, estimator, main.label, main.bars, year, threshold, factor)
    overnight, downside = _shares(frame, main.bars)
    forecasts = {e: hv.rolling_variance(frame, e, main.bars) for e in hv.ESTIMATORS}
    forecasts["har"] = har_walk[main.bars]
    if realised_1h is not None:  # dropped in _scores when too few days have 1h bars
        forecasts["realized"] = trailing_mean(realised_1h, main.bars)
    return Cone(
        estimator=estimator,
        bars_per_year=per_year,
        horizons=tuple(horizons),
        squeeze=squeeze,
        overnight=overnight,
        downside=downside,
        scores=_scores(frame, forecasts, main.bars, realised_1h),
        main=main,
    )
