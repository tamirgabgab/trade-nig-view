r"""Value at Risk and Expected Shortfall (P3, round R2; ADR 0013).

**Standardised h-bar returns.** :math:`R_{t,h} = \ln(C_{t+h}/C_t)` divided by
:math:`\sigma_t\sqrt h`,
with :math:`\sigma_t` the per-bar Yang-Zhang volatility over a month known at t. Their distribution
is measured on the real h-bar returns, so :math:`\sqrt h` is only the unit: fat tails and
autocorrelation over h bars stay in it. The loss of a long position is :math:`\ell = -z`, of a
short one :math:`\ell = z`; VaR and ES are of :math:`\ell` at the level L, then times today's
:math:`\sigma_T\sqrt h`.

**Methods** (of the losses :math:`\ell` with mean m, standard deviation s, skewness
:math:`g_1`, excess kurtosis :math:`g_2`):

* normal: :math:`\mathrm{VaR} = m + s\,z_L`, :math:`\mathrm{ES} = m + s\,\varphi(z_L)/(1-L)`;
* Cornish-Fisher: :math:`z_L` replaced by
  :math:`z + (z^2-1)g_1/6 + (z^3-3z)g_2/24 - (2z^3-5z)g_1^2/36`; ES the mean of those quantiles
  over the levels beyond L;
* FHS (filtered historical simulation): the empirical quantile, ES the mean beyond it;
* EVT: a generalised Pareto tail fitted to the exceedances over the 90th percentile u by
  probability-weighted moments (Hosking and Wallis), :math:`\xi = 2 - a_0/(a_0 - 2a_1)`,
  :math:`\beta = 2a_0a_1/(a_0 - 2a_1)`;
  :math:`\mathrm{VaR} = u + \frac{\beta}{\xi}\big[(\tfrac{N}{N_u}(1-L))^{-\xi} - 1\big]`,
  :math:`\mathrm{ES} = (\mathrm{VaR} + \beta - \xi u)/(1-\xi)`.

**Backtests** (1 bar, the last 1,000 bars, refitted every 20 on the past only): the breaches
:math:`I_t = [\ell_{t+1} > \mathrm{VaR}_t]`; Kupiec's proportion-of-failures and Christoffersen's
independence likelihood ratios (:math:`\chi^2_1`); Acerbi and Szekely's
:math:`Z_2 = 1 - \frac{1}{T(1-L)}\sum_t \ell_{t+1} I_t / \mathrm{ES}_t` (0 if the ES is right,
negative if it is too small), its p-value from 500 simulations of the model itself (seeded).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from statistics import NormalDist
from typing import Literal

import numpy as np
import numpy.typing as npt

from app.analysis.volatility import horizon_bars, unit_volatility
from app.indicators import hv
from app.models.bars import BarFrame, FloatArray

Method = Literal["normal", "cornish_fisher", "fhs", "evt"]
Tail = Literal["long", "short"]
Horizon = Literal["bar", "week", "month"]
METHODS: tuple[Method, ...] = ("normal", "cornish_fisher", "fhs", "evt")
LEVELS: tuple[float, ...] = (0.90, 0.95, 0.99)
TAILS: tuple[Tail, ...] = ("long", "short")
THRESHOLD = 0.90  # EVT: exceedances over this quantile of the losses
EVALUATE = 1000
REFIT = 20
SIMULATIONS = 500
MIN_SAMPLE = 250
ES_GRID = 200
#: Below this |xi| the GPD tail is the exponential one.
XI_ZERO = 1e-9
#: A fitted shape at or above this has an ES too uncertain (infinite at 1) to report.
XI_MAX = 0.9
_N = NormalDist()

Quantile = Callable[[FloatArray], FloatArray]


# Acklam's rational approximation of the normal quantile (relative error < 1.2e-9), vectorised:
# the simulations need it a million times, ``NormalDist.inv_cdf`` one at a time.
_A = (
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.3577518672690,
    -30.66479806614716,
    2.506628277459239,
)
_B = (
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572,
)
_C = (
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
)
_D = (0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416)
_LOW = 0.02425


def norm_ppf(p: FloatArray) -> FloatArray:
    """The standard normal quantile at p in (0, 1)."""
    p = np.asarray(p, dtype=np.float64)
    out = np.empty_like(p)
    lo, hi = p < _LOW, p > 1 - _LOW
    mid = ~lo & ~hi
    q = p[mid] - 0.5
    r = q * q
    num = (((((_A[0] * r + _A[1]) * r + _A[2]) * r + _A[3]) * r + _A[4]) * r + _A[5]) * q
    den = ((((_B[0] * r + _B[1]) * r + _B[2]) * r + _B[3]) * r + _B[4]) * r + 1
    out[mid] = num / den
    for mask, sign, x in ((lo, 1.0, p[lo]), (hi, -1.0, 1 - p[hi])):
        t = np.sqrt(-2 * np.log(x))
        num = ((((_C[0] * t + _C[1]) * t + _C[2]) * t + _C[3]) * t + _C[4]) * t + _C[5]
        den = (((_D[0] * t + _D[1]) * t + _D[2]) * t + _D[3]) * t + 1
        out[mask] = sign * num / den
    return out


# --- one sample of losses -----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GPD:
    """A fitted generalised Pareto tail over the threshold u."""

    u: float
    xi: float
    beta: float
    share: float  # N_u / N


def fit_gpd(losses: FloatArray) -> GPD | None:
    """GPD over the 90th percentile by probability-weighted moments (None if it does not fit)."""
    u = float(np.quantile(losses, THRESHOLD))
    y = np.sort(losses[losses > u] - u)
    n = len(y)
    if n < MIN_SAMPLE // 10:
        return None
    a0 = float(y.mean())
    a1 = float(np.mean(y * (n - 1 - np.arange(n)) / (n - 1)))
    d = a0 - 2 * a1
    if d <= 0:
        return None
    xi = 2 - a0 / d
    if xi >= XI_MAX:
        return None
    return GPD(u=u, xi=xi, beta=2 * a0 * a1 / d, share=n / len(losses))


def _gpd_var(t: GPD, tail: FloatArray) -> FloatArray:
    """VaR at the tail probabilities ``tail`` = 1 - L (each below the threshold share)."""
    x = tail / t.share
    if abs(t.xi) < XI_ZERO:
        return t.u - t.beta * np.log(x)
    return t.u + t.beta / t.xi * (x ** (-t.xi) - 1)


def sorted_quantile(ordered: FloatArray, p: FloatArray) -> FloatArray:
    """numpy's default (linear) quantile of an already sorted sample, for many p at once
    (``np.quantile`` partitions the sample again for every p)."""
    h = (len(ordered) - 1) * np.asarray(p, dtype=np.float64)
    i = np.minimum(np.floor(h).astype(np.int64), len(ordered) - 2)
    return ordered[i] + (h - i) * (ordered[i + 1] - ordered[i])


def cornish_fisher(z: FloatArray, g1: float, g2: float) -> FloatArray:
    return z + (z * z - 1) * g1 / 6 + (z**3 - 3 * z) * g2 / 24 - (2 * z**3 - 5 * z) * g1 * g1 / 36


@dataclass(frozen=True, slots=True)
class Sample:
    """A sample of losses, fitted once for every method: sorted, its moments and its GPD tail."""

    ordered: FloatArray
    m: float
    s: float
    g1: float  # skewness
    g2: float  # excess kurtosis
    gpd: GPD | None

    @classmethod
    def of(cls, losses: FloatArray) -> Sample:
        m, s = float(losses.mean()), float(losses.std(ddof=1))
        c = (losses - m) / s
        g1, g2 = float(np.mean(c**3)), float(np.mean(c**4) - 3)
        return cls(np.sort(losses), m, s, g1, g2, fit_gpd(losses))


def quantile_function(x: Sample, method: Method) -> Quantile | None:
    """The loss quantile at levels p in (0, 1) under ``method`` (None: EVT did not fit)."""
    match method:
        case "normal":
            return lambda p: x.m + x.s * norm_ppf(p)
        case "cornish_fisher":
            return lambda p: x.m + x.s * cornish_fisher(norm_ppf(p), x.g1, x.g2)
        case "fhs":
            return lambda p: sorted_quantile(x.ordered, p)
        case "evt":
            t = x.gpd
            if t is None:
                return None

            def q(p: FloatArray) -> FloatArray:
                beyond = 1 - p < t.share
                return np.where(
                    beyond,
                    _gpd_var(t, np.where(beyond, 1 - p, t.share)),
                    sorted_quantile(x.ordered, p),
                )

            return q


def var_es(x: Sample, method: Method, level: float) -> tuple[float, float] | None:
    """(VaR, ES) of the losses at ``level`` (None: EVT did not fit)."""
    if method == "evt":
        t = x.gpd
        if t is None:
            return None
        if 1 - level < t.share:  # beyond the threshold: the GPD tail
            var = float(_gpd_var(t, np.array([1 - level]))[0])
            return var, (var + t.beta - t.xi * t.u) / (1 - t.xi)
        method = "fhs"  # at or below the threshold the tail model does not apply
    q = quantile_function(x, method)
    assert q is not None  # noqa: S101 - only EVT can fail
    var = float(q(np.array([level]))[0])
    if method == "fhs":
        return var, float(x.ordered[x.ordered >= var].mean())
    if method == "normal":
        z = _N.inv_cdf(level)
        return var, x.m + x.s * math.exp(-z * z / 2) / math.sqrt(2 * math.pi) / (1 - level)
    grid = level + (1 - level) * (np.arange(ES_GRID) + 0.5) / ES_GRID
    return var, float(q(grid).mean())


# --- backtests ----------------------------------------------------------------------------------


def chi2_1_pvalue(lr: float) -> float:
    """P(chi-square with 1 degree of freedom > lr)."""
    return math.erfc(math.sqrt(max(lr, 0.0) / 2))


def _xlogy(x: float, y: float) -> float:
    return 0.0 if x == 0 else x * math.log(y)


def kupiec(breaches: int, n: int, p: float) -> float:
    """p-value of the proportion of failures (H0: the breach rate is p)."""
    if n == 0:
        return math.nan
    rate = breaches / n
    lr = -2 * (
        _xlogy(n - breaches, 1 - p)
        + _xlogy(breaches, p)
        - _xlogy(n - breaches, 1 - rate)
        - _xlogy(breaches, rate)
    )
    return chi2_1_pvalue(lr)


def christoffersen(hits: npt.NDArray[np.bool_]) -> float:
    """p-value of independence (H0: a breach does not make the next one likelier)."""
    a, b = hits[:-1], hits[1:]
    n00, n01 = int((~a & ~b).sum()), int((~a & b).sum())
    n10, n11 = int((a & ~b).sum()), int((a & b).sum())
    if n01 + n11 == 0 or n00 + n01 == 0 or n10 + n11 == 0:
        return math.nan
    p01, p11 = n01 / (n00 + n01), n11 / (n10 + n11)
    p = (n01 + n11) / (n00 + n01 + n10 + n11)
    restricted = _xlogy(n00 + n10, 1 - p) + _xlogy(n01 + n11, p)
    free = _xlogy(n00, 1 - p01) + _xlogy(n01, p01) + _xlogy(n10, 1 - p11) + _xlogy(n11, p11)
    return chi2_1_pvalue(-2 * (restricted - free))


def acerbi_szekely(losses: FloatArray, var: FloatArray, es: FloatArray, tail: float) -> float:
    """Z2: 0 when the ES is right, negative when the losses beyond the VaR exceed it."""
    hits = losses > var
    return float(1 - np.sum(losses * hits / es) / (len(losses) * tail))


@dataclass(frozen=True, slots=True)
class Backtest:
    method: Method
    level: float
    tail: Tail
    n: int
    breaches: int
    expected: float
    kupiec: float
    christoffersen: float
    z2: float
    z2_p: float


def backtests(z1: FloatArray, origin: int, tail: Tail) -> list[Backtest]:
    """1-bar walk-forward over the last EVALUATE origins s (the outcome z1[s], from s to s + 1,
    known by ``origin``), every method and level.
    The sample is refitted every REFIT origins on the standardised returns known by then."""
    sign = -1.0 if tail == "long" else 1.0
    origins = np.arange(max(MIN_SAMPLE + 1, origin - EVALUATE), origin)
    if len(origins) < MIN_SAMPLE // 5:
        return []
    rng = np.random.default_rng(0)
    keys: list[tuple[Method, float]] = [(m, lv) for m in METHODS for lv in LEVELS]
    var = {k: np.full(len(origins), np.nan) for k in keys}
    es = {k: np.full(len(origins), np.nan) for k in keys}
    sims = {m: np.full((SIMULATIONS, len(origins)), np.nan) for m in METHODS}
    for lo in range(0, len(origins), REFIT):
        block = slice(lo, min(lo + REFIT, len(origins)))
        pool = sign * z1[: int(origins[lo])]  # z1[t] is known at s0 for t < s0
        pool = pool[np.isfinite(pool)]
        if len(pool) < MIN_SAMPLE:
            continue
        x = Sample.of(pool)
        u = rng.uniform(1e-6, 1 - 1e-6, (SIMULATIONS, block.stop - block.start))
        for method in METHODS:
            q = quantile_function(x, method)
            if q is None:
                continue
            sims[method][:, block] = q(u)
            for level in LEVELS:
                fitted = var_es(x, method, level)
                if fitted is not None:
                    var[(method, level)][block], es[(method, level)][block] = fitted
    real = sign * z1[origins]  # the outcome from s to s + 1
    out: list[Backtest] = []
    for method, level in keys:
        ok = np.isfinite(var[(method, level)]) & np.isfinite(real)
        if ok.sum() < MIN_SAMPLE // 5:
            continue
        v, e, r = var[(method, level)][ok], es[(method, level)][ok], real[ok]
        hits = r > v
        tail_p = 1 - level
        z2 = acerbi_szekely(r, v, e, tail_p)
        z2_sims = np.array([acerbi_szekely(row[ok], v, e, tail_p) for row in sims[method]])
        n, k = int(ok.sum()), int(hits.sum())
        out.append(
            Backtest(
                method=method,
                level=level,
                tail=tail,
                n=n,
                breaches=k,
                expected=n * tail_p,
                kupiec=kupiec(k, n, tail_p),
                christoffersen=christoffersen(hits),
                z2=z2,
                z2_p=float(np.mean(z2_sims <= z2)),
            )
        )
    return out


# --- the report ---------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Estimate:
    horizon: Horizon
    bars: int
    method: Method
    level: float
    tail: Tail
    var: float  # loss as a fraction of the price (positive = a loss)
    es: float


@dataclass(frozen=True, slots=True)
class TailFit:
    tail: Tail
    u: float
    xi: float
    beta: float
    exceedances: int


@dataclass(frozen=True, slots=True)
class Report:
    sigma: float
    estimates: tuple[Estimate, ...]
    tails: tuple[TailFit, ...]
    backtests: tuple[Backtest, ...]


def standardised(frame: BarFrame, sigma: FloatArray, h: int) -> FloatArray:
    """:math:`z_{t,h} = \\ln(C_{t+h}/C_t) / (\\sigma_t \\sqrt h)` (NaN where it does not exist)."""
    c = frame.close
    z = np.full(len(c), np.nan)
    if len(c) > h:
        with np.errstate(divide="ignore", invalid="ignore"):
            z[:-h] = np.log(c[h:] / c[:-h]) / (sigma[:-h] * math.sqrt(h))
    return z


def to_price(loss: FloatArray, unit: float, tail: Tail) -> FloatArray:
    """Losses in sigma-units as fractions of the price: a fall of 1 - e^{-l u} (long) or a rise
    of e^{l u} - 1 (short; inf when it overflows)."""
    with np.errstate(over="ignore"):
        x = np.asarray(loss, dtype=np.float64) * unit
        return 1 - np.exp(-x) if tail == "long" else np.exp(x) - 1


def price_estimates(x: Sample, label: Horizon, h: int, unit: float, tail: Tail) -> list[Estimate]:
    """Every method and level in price terms. The ES is the mean of the price losses beyond the
    VaR (not the price of the mean loss: the exponential is convex)."""
    out: list[Estimate] = []
    for method in METHODS:
        q = quantile_function(x, method)
        for level in LEVELS:
            got = var_es(x, method, level)
            if got is None or q is None:
                continue
            if method == "fhs":
                beyond = x.ordered[x.ordered >= got[0]]
            else:
                beyond = q(level + (1 - level) * (np.arange(ES_GRID) + 0.5) / ES_GRID)
            var = float(to_price(np.array([got[0]]), unit, tail)[0])
            es = float(np.mean(to_price(beyond, unit, tail)))
            if math.isfinite(var) and math.isfinite(es):
                out.append(Estimate(label, h, method, level, tail, var, es))
    return out


def _horizons(frame: BarFrame) -> list[tuple[Horizon, int]]:
    """1 bar, then a week and a month in bars (when they are at least two bars)."""
    spans = horizon_bars(float(hv.bars_per_year(frame.time)[-1]))
    out: list[tuple[Horizon, int]] = [("bar", 1)]
    if "week" in spans:
        out.append(("week", spans["week"]))
    if "month" in spans:
        out.append(("month", spans["month"]))
    return out


def report(frame: BarFrame) -> Report | None:
    """VaR and ES at the last bar for 1 bar, a week and a month, every method, level and tail;
    the 1-bar backtests. None if the history is too short."""
    if len(frame) < MIN_SAMPLE:
        return None
    sigma = unit_volatility(frame)
    now = float(sigma[-1])
    if not math.isfinite(now) or now <= 0:
        return None
    horizons = _horizons(frame)
    estimates: list[Estimate] = []
    tails: list[TailFit] = []
    for label, h in horizons:
        z = standardised(frame, sigma, h)
        z = z[np.isfinite(z)]
        if len(z) < MIN_SAMPLE:
            continue
        for tail in TAILS:
            losses = -z if tail == "long" else z
            x = Sample.of(losses)
            if h == 1 and x.gpd is not None:
                g = x.gpd
                tails.append(TailFit(tail, g.u, g.xi, g.beta, round(g.share * len(z))))
            estimates += price_estimates(x, label, h, now * math.sqrt(h), tail)
    if not estimates:
        return None
    z1 = standardised(frame, sigma, 1)
    scores = [b for tail in TAILS for b in backtests(z1, len(frame) - 1, tail)]
    return Report(now, tuple(estimates), tuple(tails), tuple(scores))
