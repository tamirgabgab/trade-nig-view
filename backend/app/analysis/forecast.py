r"""Probabilistic OHLC forecast of the next k bars (P3, round F1).

**Targets.** For a forecast made at the close of bar :math:`t` and a horizon :math:`h \ge 1`,
four log ratios against the close :math:`C_t` describe bar :math:`t+h` and always rebuild a valid
candle (:math:`L \le O, C \le H`):

.. math::
    g_h = \ln\frac{O_{t+h}}{C_t},\quad r_h = \ln\frac{C_{t+h}}{C_t},\quad
    u_h = \ln\frac{H_{t+h}}{\max(O_{t+h}, C_{t+h})} \ge 0,\quad
    d_h = \ln\frac{\min(O_{t+h}, C_{t+h})}{L_{t+h}} \ge 0.

**Features** (bars :math:`\le t` only): the same four ratios of each of the last :math:`p` bars
against their previous close (gap, return, upper and lower wick), and the HAR terms of the log
range :math:`\ell_t = \ln \max(\ln(H_t/L_t), \epsilon)` averaged over 1, 5 and 22 bars.

**Direct multi-horizon.** One regression per horizon :math:`h`, trained on the pairs
:math:`(x_s, y_{s,h})` with :math:`s + h \le T` (the forecast origin): nothing after :math:`T` is
used.

* **Model A (OLS):** :math:`y = \beta^\top x + \varepsilon` by least squares, per target.
* **Model C (Ridge + HAR):** a HAR regression of the horizon's log range,
  :math:`\ln \bar R_{t,h} = c + b_1 \ell_t + b_5 \bar\ell_{t,5} + b_{22} \bar\ell_{t,22}` with
  :math:`\bar R_{t,h}` the mean range of bars :math:`t+1..t+h`, gives the scale
  :math:`\hat s_{t,h} = e^{\widehat{\ln \bar R}}`; the targets divided by :math:`\hat s` are
  fitted by ridge regression on standardised features,
  :math:`\hat\beta = (X^\top X + \alpha I)^{-1} X^\top z` (intercept not penalised).
* **Naive:** the unconditional distribution of the window (no features): the benchmark.

**Distribution.** The training residual rows (all four targets of one bar together, so their
dependence is kept) are added to the forecast location (model C: in scaled units, times the
forecast scale); every row rebuilds a candle, wicks clipped at 0. Quantiles, P(up) and the
expected range are taken over those candles: an empirical, deterministic distribution.

**Walk-forward evaluation.** Origins :math:`T` over the last ``evaluate`` bars that have an
outcome, refitted every ``refit`` bars on data up to the refit origin only. Scores: the mean
pinball loss of the four targets at the quantile levels, the coverage of the central intervals
of the close, the out-of-sample :math:`R^2 = 1 - \sum (r - \hat r)^2 / \sum r^2` of the return
against a zero-mean random walk, and the direction hit rate. **Auto-tuning** picks the window,
the ridge strength and the lags with the lowest pinball loss at :math:`h = 1` in that evaluation,
which uses only the past of each origin.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt

from app.models.bars import BarFrame, FloatArray

Model = Literal["a", "c", "naive"]
#: Quantile levels of the forecast (central 50 / 80 / 95 % intervals and the median).
LEVELS: tuple[float, ...] = (0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975)
INTERVALS: tuple[tuple[float, float], ...] = ((0.25, 0.75), (0.1, 0.9), (0.025, 0.975))
TARGETS = ("gap", "return", "upper_wick", "lower_wick")
#: Order-statistic quantiles (no interpolation): they commute with every monotone map, so the
#: quantiles of scale * (loc + e), wick clip included, are the map of the residuals' quantiles.
QUANTILE_METHOD = "inverted_cdf"
#: HAR averaging lengths of the log range.
HAR = (1, 5, 22)
RANGE_FLOOR = 1e-5
MIN_TRAIN = 60
WINDOWS: tuple[int | None, ...] = (250, 500, 1000, None)
RIDGES: tuple[float, ...] = (1.0, 10.0, 100.0, 1000.0)
LAGS: tuple[int, ...] = (1, 3, 5)

Matrix = npt.NDArray[np.float64]


@dataclass(frozen=True, slots=True)
class Params:
    """``window``: training bars (None = all); ``ridge``: model C's penalty; ``lags``: p."""

    window: int | None = 500
    ridge: float = 100.0
    lags: int = 3


@dataclass(frozen=True, slots=True)
class Fit:
    """A fitted horizon: location coefficients per target, the scale model, the residuals."""

    model: Model
    beta: Matrix  # (features + 1) x 4, intercept first
    mean: FloatArray  # feature standardisation (model C), else zeros
    std: FloatArray
    scale: FloatArray | None  # HAR coefficients (model C), intercept first
    residuals: Matrix  # rows x 4 (model C: in scaled units)


@dataclass(frozen=True, slots=True)
class Horizon:
    h: int
    #: Price quantiles at ``LEVELS``: one row per level, columns open, high, low, close.
    quantiles: Matrix
    p_up: float
    #: Mean (H - L) / C_t of the candles.
    expected_range: float


@dataclass(frozen=True, slots=True)
class Scores:
    n: int
    pinball: float
    coverage: tuple[float, float, float]  # close in the 50 / 80 / 95 % intervals
    r2: float
    #: Share of right directions among the forecasts with a non-zero median (NaN if none).
    hit_rate: float


# --- data ---------------------------------------------------------------------------------------


def bar_ratios(frame: BarFrame) -> Matrix:
    """n x 4: each bar's gap, return, upper and lower wick (gap and return NaN on bar 0)."""
    o, h, low, c = frame.open, frame.high, frame.low, frame.close
    prev = np.concatenate(([np.nan], c[:-1]))
    top = np.maximum(o, c)
    bottom = np.minimum(o, c)
    return np.column_stack(
        (np.log(o / prev), np.log(c / prev), np.log(h / top), np.log(bottom / low))
    )


def log_range(frame: BarFrame) -> FloatArray:
    """:math:`\\ell_t = \\ln \\max(\\ln(H/L), \\epsilon)`."""
    return np.log(np.maximum(np.log(frame.high / frame.low), RANGE_FLOOR))


def _trailing_mean(x: FloatArray, n: int) -> FloatArray:
    """Mean of x over bars t-n+1..t (NaN before n values)."""
    out = np.full(len(x), np.nan)
    if len(x) >= n:
        c = np.cumsum(np.concatenate(([0.0], x)))
        out[n - 1 :] = (c[n:] - c[:-n]) / n
    return out


def har_terms(frame: BarFrame) -> Matrix:
    """n x 3: the log range averaged over 1, 5 and 22 bars."""
    lr = log_range(frame)
    return np.column_stack([_trailing_mean(lr, n) for n in HAR])


def features(frame: BarFrame, lags: int) -> Matrix:
    """n x (4 lags + 3): the ratios of bars t, t-1, ..., t-lags+1, then the HAR terms."""
    ratios = bar_ratios(frame)
    n = len(frame)
    cols: list[FloatArray] = []
    for j in range(lags):
        shifted = np.full((n, 4), np.nan)
        shifted[j:] = ratios[: n - j]
        cols.extend(shifted.T)
    cols.extend(har_terms(frame).T)
    return np.column_stack(cols)


def feature_names(lags: int) -> list[str]:
    names = [f"{target}[t-{j}]" if j else f"{target}[t]" for j in range(lags) for target in TARGETS]
    return names + [f"log_range_mean_{n}" for n in HAR]


def targets(frame: BarFrame, h: int) -> Matrix:
    """n x 4: the targets of bar t+h against C_t (NaN where t+h is past the data)."""
    n = len(frame)
    out = np.full((n, 4), np.nan)
    if h < n:
        o, hi, lo, c = (x[h:] for x in (frame.open, frame.high, frame.low, frame.close))
        base = frame.close[: n - h]
        out[: n - h] = np.column_stack(
            (
                np.log(o / base),
                np.log(c / base),
                np.log(hi / np.maximum(o, c)),
                np.log(np.minimum(o, c) / lo),
            )
        )
    return out


def horizon_log_range(frame: BarFrame, h: int) -> FloatArray:
    """:math:`\\ln \\bar R_{t,h}`: the log of the mean range of bars t+1..t+h (model C's scale)."""
    r = np.maximum(np.log(frame.high / frame.low), RANGE_FLOOR)
    mean = _trailing_mean(r, h)  # bars t-h+1..t
    out = np.full(len(frame), np.nan)
    if h < len(frame):
        out[: len(frame) - h] = np.log(mean[h:])
    return out


# --- fitting -----------------------------------------------------------------------------------


def _ols(x: Matrix, y: Matrix) -> Matrix:
    """Least squares with an intercept column; (features + 1) x targets."""
    design = np.column_stack((np.ones(len(x)), x))
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    return beta


def ridge(x: Matrix, y: Matrix, alpha: float) -> tuple[Matrix, FloatArray, FloatArray]:
    """Ridge on standardised features, intercept not penalised: (beta, mean, std)."""
    mean = x.mean(axis=0)
    std = x.std(axis=0)
    std[std == 0] = 1.0
    xs = (x - mean) / std
    k = xs.shape[1]
    w = np.linalg.solve(xs.T @ xs + alpha * np.eye(k), xs.T @ (y - y.mean(axis=0)))
    return np.vstack((y.mean(axis=0), w)), mean, std


def _predict(beta: Matrix, x: Matrix, mean: FloatArray, std: FloatArray) -> Matrix:
    return beta[0] + ((x - mean) / std) @ beta[1:]


@dataclass(frozen=True, slots=True)
class Design:
    """Everything one (frame, lags) needs, computed once."""

    x: Matrix
    har: Matrix
    y: dict[int, Matrix]
    scale_y: dict[int, FloatArray]
    close: FloatArray


def design(frame: BarFrame, lags: int, horizons: Sequence[int]) -> Design:
    return Design(
        x=features(frame, lags),
        har=har_terms(frame),
        y={h: targets(frame, h) for h in horizons},
        scale_y={h: horizon_log_range(frame, h) for h in horizons},
        close=frame.close,
    )


def training_rows(d: Design, h: int, origin: int, window: int | None) -> npt.NDArray[np.intp]:
    """Rows s with s + h <= origin (outcome known at the origin), in the window, all finite."""
    last = origin - h
    first = 0 if window is None else max(0, last - window + 1)
    rows = np.arange(first, last + 1)
    ok = (
        np.isfinite(d.x[rows]).all(axis=1)
        & np.isfinite(d.y[h][rows]).all(axis=1)
        & np.isfinite(d.scale_y[h][rows])
    )
    return rows[ok]


def fit(d: Design, h: int, origin: int, model: Model, params: Params) -> Fit | None:
    """The model for horizon h with data up to ``origin``; None below ``MIN_TRAIN`` rows."""
    rows = training_rows(d, h, origin, params.window)
    if len(rows) < MIN_TRAIN:
        return None
    x, y = d.x[rows], d.y[h][rows]
    nf = x.shape[1]
    zeros, ones = np.zeros(nf), np.ones(nf)
    if model == "naive":
        beta = np.vstack((y.mean(axis=0), np.zeros((nf, 4))))
        return Fit(model, beta, zeros, ones, None, y - beta[0])
    if model == "a":
        beta = _ols(x, y)
        return Fit(model, beta, zeros, ones, None, y - _predict(beta, x, zeros, ones))
    har = d.har[rows]
    scale = _ols(har, d.scale_y[h][rows][:, None])[:, 0]
    s = np.exp(scale[0] + har @ scale[1:])
    z = y / s[:, None]
    beta, mean, std = ridge(x, z, params.ridge)
    return Fit(model, beta, mean, std, scale, z - _predict(beta, x, mean, std))


def location_and_scale(f: Fit, d: Design, at: npt.NDArray[np.intp]) -> tuple[Matrix, FloatArray]:
    """Forecast location (rows x 4) and scale (rows) at origins ``at``."""
    loc = _predict(f.beta, d.x[at], f.mean, f.std)
    if f.scale is None:
        return loc, np.ones(len(at))
    return loc, np.exp(f.scale[0] + d.har[at] @ f.scale[1:])


def samples(f: Fit, loc: FloatArray, scale: float) -> Matrix:
    """Target scenarios (residual rows x 4) for one origin; wicks clipped at 0."""
    y = scale * (loc + f.residuals)
    y[:, 2:] = np.maximum(y[:, 2:], 0.0)
    return y


def candles(y: Matrix, close: float) -> Matrix:
    """Scenario targets -> rows of (open, high, low, close) prices."""
    o = close * np.exp(y[:, 0])
    c = close * np.exp(y[:, 1])
    return np.column_stack(
        (o, np.maximum(o, c) * np.exp(y[:, 2]), np.minimum(o, c) * np.exp(-y[:, 3]), c)
    )


def horizon_forecast(f: Fit, d: Design, origin: int, h: int) -> Horizon:
    loc, scale = location_and_scale(f, d, np.array([origin]))
    y = samples(f, loc[0], float(scale[0]))
    close = float(d.close[origin])
    bars = candles(y, close)
    return Horizon(
        h=h,
        quantiles=np.quantile(bars, LEVELS, axis=0, method=QUANTILE_METHOD),
        p_up=float((y[:, 1] > 0).mean()),
        expected_range=float(((bars[:, 1] - bars[:, 2]) / close).mean()),
    )


def target_quantiles(f: Fit, loc: Matrix, scale: FloatArray) -> npt.NDArray[np.float64]:
    """origins x 4 x levels quantiles of the targets. A scenario is scale * (loc + residual), a
    monotone map of the residual (the wick clip at 0 too), so its quantiles are the map of the
    residual quantiles: no scenarios are built."""
    qe = np.quantile(f.residuals, LEVELS, axis=0, method=QUANTILE_METHOD).T  # 4 x levels
    q = scale[:, None, None] * (loc[:, :, None] + qe[None, :, :])
    q[:, 2:, :] = np.maximum(q[:, 2:, :], 0.0)
    return q


# --- evaluation --------------------------------------------------------------------------------


def _pinball(y: FloatArray, q: Matrix) -> float:
    """Mean pinball loss of outcomes y (n) against quantiles q (n x levels)."""
    levels = np.asarray(LEVELS)
    diff = y[:, None] - q
    return float(np.mean(np.maximum(levels * diff, (levels - 1) * diff)))


def evaluate(
    d: Design, h: int, model: Model, params: Params, origins: npt.NDArray[np.intp], refit: int
) -> Scores | None:
    """Walk-forward scores at ``origins`` (each needs its outcome at origin + h)."""
    outcomes: list[Matrix] = []
    quants: list[npt.NDArray[np.float64]] = []
    means: list[FloatArray] = []
    for start in range(0, len(origins), refit):
        block = origins[start : start + refit]
        f = fit(d, h, int(block[0]), model, params)
        if f is None:
            continue
        ok = np.isfinite(d.x[block]).all(axis=1) & np.isfinite(d.y[h][block]).all(axis=1)
        block = block[ok]
        if len(block) == 0:
            continue
        loc, scale = location_and_scale(f, d, block)
        quants.append(target_quantiles(f, loc, scale))
        outcomes.append(d.y[h][block])
        means.append(scale * loc[:, 1])
    if not outcomes:
        return None
    out = np.concatenate(outcomes)  # n x 4
    q = np.concatenate(quants)  # n x 4 x levels
    pinball = float(np.mean([_pinball(out[:, j], q[:, j, :]) for j in range(4)]))
    r = out[:, 1]
    qr = q[:, 1, :]
    coverage = tuple(
        float(np.mean((r >= qr[:, LEVELS.index(lo)]) & (r <= qr[:, LEVELS.index(hi)])))
        for lo, hi in INTERVALS
    )
    pred = np.concatenate(means)
    denom = float(np.sum(r * r))
    # Direction: only forecasts that pick one (a zero median, e.g. on prices that often do not
    # move, says nothing) against outcomes that moved.
    median = qr[:, LEVELS.index(0.5)]
    called = (median != 0) & (r != 0)
    same_sign: npt.NDArray[np.bool_] = np.sign(median[called]) == np.sign(r[called])
    return Scores(
        n=len(r),
        pinball=pinball,
        coverage=(coverage[0], coverage[1], coverage[2]),
        r2=1.0 - float(np.sum((r - pred) ** 2)) / denom if denom > 0 else float("nan"),
        hit_rate=float(np.mean(same_sign)) if called.any() else float("nan"),
    )


def eval_origins(n: int, h: int, evaluate_bars: int, skip: int = 0) -> npt.NDArray[np.intp]:
    """The last ``evaluate_bars`` origins whose outcome at origin + h exists, ending ``skip``
    origins before the last one (tuning skips the bars the validation scores)."""
    last = n - 1 - h - skip
    return np.arange(max(0, last - evaluate_bars + 1), last + 1)


def tune(
    frame: BarFrame, model: Model, evaluate_bars: int, refit: int, skip: int = 0
) -> tuple[Params, list[tuple[Params, float]]]:
    """The grid point with the lowest walk-forward pinball loss at h = 1 over ``evaluate_bars``
    origins ending ``skip`` bars before the last (so a validation of those last bars stays out of
    sample). Model A has no penalty: only the first ridge value is tried."""
    tried: list[tuple[Params, float]] = []
    origins = eval_origins(len(frame), 1, evaluate_bars, skip)
    for lags in LAGS:
        d = design(frame, lags, [1])
        for window in WINDOWS:
            for alpha in RIDGES if model == "c" else RIDGES[:1]:
                params = Params(window, alpha, lags)
                s = evaluate(d, 1, model, params, origins, refit)
                if s is not None:
                    tried.append((params, s.pinball))
    if not tried:
        return Params(), []
    tried.sort(key=lambda item: item[1])
    return tried[0][0], tried
