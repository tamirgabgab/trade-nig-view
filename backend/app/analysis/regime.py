r"""Market regime at the origin, with significance, and whether it changes what works (P3, round G1;
ADR 0014). The window is the last calendar year of bars.

* **Variance ratios** VR(q), q = 2, 4, 8, 16, their robust :math:`z^*` (``variance_ratio``) and the
  Chow-Denning statistic :math:`\max_q |z^*|`. Its p-value by **wild bootstrap** (Kim, 2006): the
  window's demeaned returns times random signs (Rademacher, seeded), 999 times; a sign flip keeps
  each return's size (volatility clustering, fat tails) and destroys any serial dependence, so it is
  the null of a martingale. The asymptotic (Sidak) p-value is shown too.
* **Hurst** by DFA (``hurst``) on the window and on the whole history, against its spread on 199
  shuffles of the window (a shuffle keeps the returns and removes their order: the random-walk
  null).
* **MF-DFA**: the q-order fluctuation :math:`F_q(s) = [\frac{1}{n_s}\sum_b (RSS_b/s)^{q/2}]^{1/q}`,
  :math:`H(q)` its log-log slope for q = -2, -1, 1, 2, 3, 4, and the width
  :math:`\Delta h = H(-2) - H(4)`: large when big and small moves scale differently.
* **The regime** now: trend if the bootstrap p < 0.05 and :math:`z > 0`, reversion if p < 0.05 and
  :math:`z < 0`, else random. With the volatility percentile (``hv_percentile``, a month, among the
  last year) above or below 50 it places the bar on a 3 x 2 map; the history's share of bars in
  each cell is shown.
* **Event study by regime**: two trend rules (EMA 20 crossing above EMA 50; a close crossing above
  the upper Bollinger band) and two reversion rules (RSI 14 crossing below 30; a close crossing
  below the lower band), all long, with the regime each signal bar had (the ``regime`` indicator,
  bars up to the signal only). The forward h-bar log return after the signals, against all the bars
  of the same regime: n, mean, edge and its t-statistic, hit rate.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt

from app.indicators import hurst, regime, variance_ratio
from app.indicators.catalog import CATALOG
from app.indicators.hv import bars_per_year, returns, rolling_variance
from app.indicators.hv_percentile import percent_rank
from app.models.bars import BarFrame, FloatArray

Label = Literal["trend", "random", "reversion"]
Family = Literal["trend", "reversion"]
#: The ``regime`` indicator's values.
LABELS: dict[float, Label] = {1.0: "trend", 0.0: "random", -1.0: "reversion"}
BOOTSTRAPS = 999
SHUFFLES = 199
ALPHA = 0.05
MF_QS: tuple[float, ...] = (-2.0, -1.0, 1.0, 2.0, 3.0, 4.0)
FORWARD = 10
MIN_WINDOW = 4 * max(variance_ratio.QS)


def _norm_sf(x: float) -> float:
    return 0.5 * math.erfc(x / math.sqrt(2))


@dataclass(frozen=True, slots=True)
class Ratio:
    q: int
    vr: float
    z: float


@dataclass(frozen=True, slots=True)
class Spectrum:
    qs: tuple[float, ...]
    h: tuple[float, ...]
    width: float


@dataclass(frozen=True, slots=True)
class RuleStats:
    rule: str
    family: Family
    regime: Label
    n: int
    mean: float  # mean forward log return after the signals
    edge: float  # minus the mean after every bar of that regime
    t: float
    hit_rate: float


@dataclass(frozen=True, slots=True)
class Report:
    window: int
    ratios: tuple[Ratio, ...]
    cd: float  # signed Chow-Denning statistic
    p_bootstrap: float
    p_asymptotic: float
    hurst_window: float
    hurst_null: tuple[float, float]  # 5 and 95 % of H on shuffles
    hurst_history: float
    spectrum_window: Spectrum | None
    spectrum_history: Spectrum | None
    label: Label  # by the bootstrap test
    tint: Label | None  # by the 2.49 test of the chart's tint, the map and the event study
    high_volatility: bool | None
    cells: dict[tuple[Label, bool], float]  # share of the history's bars
    rules: tuple[RuleStats, ...]


def wild_bootstrap(r: FloatArray, observed: float, rng: np.random.Generator) -> float:
    """P(max |z*| >= |observed|) over sign-flipped demeaned returns."""
    d = r - r.mean()
    signs = rng.choice((-1.0, 1.0), size=(BOOTSTRAPS, len(d)))
    _, z = variance_ratio.vr_stats(signs * d)
    stat = np.nanmax(np.abs(z), axis=1)
    return float((1 + np.sum(stat >= abs(observed))) / (BOOTSTRAPS + 1))


def dfa_h(r: FloatArray, scales: tuple[int, ...]) -> float:
    """DFA H of one series of returns (boxes counted back from its end, as ``hurst``)."""
    profile = np.concatenate(([0.0], np.cumsum(r - r.mean())))
    f = hurst.fluctuations(profile, len(r), scales)[:, -1:]
    return float(hurst.slope(scales, f)[0])


def scales_for(n: int) -> tuple[int, ...]:
    """Powers of two from 8 up to n / 4."""
    out: list[int] = []
    s = 8
    while s <= n // 4:
        out.append(s)
        s *= 2
    return tuple(out)


#: Largest MF-DFA scale (bars): longer ones hold too few boxes to add information.
MF_MAX_SCALE = 256


def box_f2(r: FloatArray, s: int) -> FloatArray:
    """Per non-overlapping box of s returns, counted back from the end: the mean squared
    residual of a straight line fitted to the profile in the box."""
    nb = len(r) // s
    profile = np.cumsum(r - r.mean())[len(r) - nb * s :].reshape(nb, s)
    y = profile - profile.mean(axis=1, keepdims=True)
    x = np.arange(s) - (s - 1) / 2
    sxy = y @ x
    return ((y * y).sum(axis=1) - sxy * sxy / (x @ x)) / s


def mfdfa(r: FloatArray) -> Spectrum | None:
    """H(q) of MF-DFA over non-overlapping boxes from the end of ``r`` (scales 8..256)."""
    scales = tuple(s for s in scales_for(len(r)) if s <= MF_MAX_SCALE)
    if len(scales) < 3:  # noqa: PLR2004 - a slope needs at least three scales here
        return None
    f2s = [np.maximum(box_f2(r, s), 1e-300) for s in scales]  # once per scale, every q
    x = np.log(np.asarray(scales, dtype=np.float64))
    x = x - x.mean()
    hs: list[float] = []
    for q in MF_QS:
        lf = np.array([math.log(float(np.mean(f2 ** (q / 2)))) / q for f2 in f2s])
        hs.append(float(x @ (lf - lf.mean()) / (x @ x)))
    return Spectrum(MF_QS, tuple(hs), hs[0] - hs[-1])


def _label(p: float, z: float) -> Label:
    if p >= ALPHA:
        return "random"
    return "trend" if z > 0 else "reversion"


def _crossings(a: FloatArray, b: FloatArray, above: bool) -> npt.NDArray[np.bool_]:
    """Bars where a crosses above (or below) b."""
    prev_a, prev_b = np.roll(a, 1), np.roll(b, 1)
    with np.errstate(invalid="ignore"):
        hit = (a > b) & (prev_a <= prev_b) if above else (a < b) & (prev_a >= prev_b)
    hit[0] = False
    return hit & np.isfinite(a) & np.isfinite(b) & np.isfinite(prev_a) & np.isfinite(prev_b)


def signals(frame: BarFrame) -> dict[str, tuple[Family, npt.NDArray[np.bool_]]]:
    """The four long rules, from the registry's indicators (one implementation)."""
    c = frame.close
    fast = CATALOG["ema"].run(frame, {"length": 20})["ma"]
    slow = CATALOG["ema"].run(frame, {"length": 50})["ma"]
    bb = CATALOG["bb"].run(frame, {})
    rsi = CATALOG["rsi"].run(frame, {})["rsi"]
    return {
        "EMA 20 crosses 50 up": ("trend", _crossings(fast, slow, above=True)),
        "Close above upper BB": ("trend", _crossings(c, bb["upper"], True)),
        "RSI below 30": ("reversion", _crossings(rsi, np.full(len(c), 30.0), above=False)),
        "Close below lower BB": (
            "reversion",
            _crossings(c, bb["lower"], above=False),
        ),
    }


def event_study(frame: BarFrame, labels: FloatArray, h: int = FORWARD) -> tuple[RuleStats, ...]:
    """Each rule's forward h-bar return by the regime its signal bars had."""
    c = frame.close
    forward = np.full(len(c), np.nan)
    forward[: len(c) - h] = np.log(c[h:] / c[:-h])
    out: list[RuleStats] = []
    for rule, (family, hits) in signals(frame).items():
        for value, name in LABELS.items():
            in_regime = (labels == value) & np.isfinite(forward)
            x = forward[hits & in_regime]
            base = forward[in_regime]
            if len(x) < 2 or len(base) < 2:  # noqa: PLR2004 - a standard deviation needs two
                continue
            edge = float(x.mean() - base.mean())
            se = float(x.std(ddof=1) / math.sqrt(len(x)))
            out.append(
                RuleStats(
                    rule=rule,
                    family=family,
                    regime=name,
                    n=len(x),
                    mean=float(x.mean()),
                    edge=edge,
                    t=edge / se if se > 0 else math.nan,
                    hit_rate=float(np.mean(x > 0)),
                )
            )
    return tuple(out)


def report(frame: BarFrame, seed: int = 0) -> Report | None:
    """The regime at the last bar from the bars up to it (None if under a year of history)."""
    window = round(float(bars_per_year(frame.time)[-1])) if len(frame) > 1 else 0
    window = max(window, MIN_WINDOW)
    r_all = returns(frame)[1:]
    r = r_all[-window:]
    if len(r) < window or not np.isfinite(r).all():
        return None
    r_all = r_all[np.isfinite(r_all)]  # an old bad close must not void the whole history
    rng = np.random.default_rng(seed)
    vr_rows, z_rows = variance_ratio.vr_stats(r[None, :])
    vr, z = vr_rows[0], z_rows[0]
    if not np.isfinite(z).any():  # a flat window: no returns to test
        return None
    pick = int(np.nanargmax(np.abs(z)))
    cd = float(z[pick])
    p_boot = wild_bootstrap(r, cd, rng)
    m = len(variance_ratio.QS)
    p_asym = 1 - (1 - 2 * _norm_sf(abs(cd))) ** m
    scales = tuple(s for s in hurst.SCALES if s <= window // 4)
    shuffled = [dfa_h(rng.permutation(r), scales) for _ in range(SHUFFLES)]
    labels = regime.label(variance_ratio.rolling_z(frame, window))
    # The month volatility's percentile among the window (direct: a year of 24-hour hourly bars
    # is above the indicator's parameter range).
    rank = percent_rank(rolling_variance(frame, "yang_zhang", 21), window)
    high: npt.NDArray[np.bool_] = rank >= 50  # noqa: PLR2004 - above the last year's median
    ok = np.isfinite(labels) & np.isfinite(rank)
    cells: dict[tuple[Label, bool], float] = {}
    for value, name in LABELS.items():
        for vol in (False, True):
            hit = (labels[ok] == value) & (high[ok] == vol)
            cells[(name, vol)] = float(hit.mean()) if ok.any() else 0.0
    label = _label(p_boot, cd)
    return Report(
        window=window,
        ratios=tuple(
            Ratio(q, float(v), float(s)) for q, v, s in zip(variance_ratio.QS, vr, z, strict=True)
        ),
        cd=cd,
        p_bootstrap=p_boot,
        p_asymptotic=float(p_asym),
        hurst_window=dfa_h(r, scales),
        hurst_null=(float(np.quantile(shuffled, 0.05)), float(np.quantile(shuffled, 0.95))),
        hurst_history=dfa_h(r_all, tuple(x for x in scales_for(len(r_all)) if x <= MF_MAX_SCALE)),
        spectrum_window=mfdfa(r),
        spectrum_history=mfdfa(r_all),
        label=label,
        tint=LABELS.get(float(labels[-1])) if np.isfinite(labels[-1]) else None,
        high_volatility=bool(high[-1]) if np.isfinite(rank[-1]) else None,
        cells=cells,
        rules=event_study(frame, labels),
    )
