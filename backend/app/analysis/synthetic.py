r"""Deterministic synthetic daily bars for the learn lab (no market data, no network).

Every scenario is a log-price path :math:`x_t = \ln C_t` with :math:`C_0 = 100` and standard
normal shocks :math:`\varepsilon_t` from ``numpy.random.default_rng(seed)``. Bars fall on business
days (Mon-Fri) from 2020-01-01, stamped at 00:00 UTC like real daily bars.

Close path, :math:`r_t = x_t - x_{t-1}` for :math:`t \ge 1` (:math:`r_0 = 0`), with
:math:`h = \lfloor n/2 \rfloor` the half-way bar:

* ``random_walk`` (the null hypothesis: no rule has an edge):
  :math:`r_t = \mu + \sigma \varepsilon_t`, :math:`\mu = 0.0003`, :math:`\sigma = 0.015`
  (geometric Brownian motion sampled daily; :math:`\mu` is the drift of the log price).
* ``uptrend``: the same with :math:`\mu = 0.0015`, :math:`\sigma = 0.012`.
* ``range``: discrete Ornstein-Uhlenbeck around :math:`\ln 100`,
  :math:`x_t = x_{t-1} + \theta(\ln 100 - x_{t-1}) + \sigma \varepsilon_t`, :math:`\theta = 0.08`,
  :math:`\sigma = 0.015` (an AR(1) deviation with coefficient :math:`1 - \theta`, stationary
  standard deviation :math:`\sigma / \sqrt{1 - (1 - \theta)^2} \approx 0.038`).
* ``reversal``: :math:`\mu = +0.0025` for :math:`t < h`, :math:`-0.0025` from :math:`h` on,
  :math:`\sigma = 0.012`.
* ``shock``: ``random_walk`` with the same shocks plus a jump :math:`\ln 0.85` (-15 %) at bar
  :math:`h`; the open of bar :math:`h` carries the jump, so it is a real gap down.
* ``volatility_regime``: :math:`\mu = 0`, :math:`\sigma_t = 0.008` for :math:`t < h` and
  :math:`0.03` from :math:`h` on (a 3.75x volatility jump).

OHLCV from the close path, with :math:`\sigma_t` the scenario's sigma at bar t, independent
standard normals :math:`\eta, \nu, \lambda, \xi`, :math:`C_{-1} = 100` and :math:`J_t` the jump
factor (0.85 on the shock bar, 1 elsewhere):

.. math::

    O_t = C_{t-1} J_t e^{\eta_t \sigma_t / 4}, \quad
    H_t = \max(O_t, C_t) e^{|\nu_t| \sigma_t / 2}, \quad
    L_t = \min(O_t, C_t) e^{-|\lambda_t| \sigma_t / 2}, \quad
    V_t = 10^6 e^{0.3 \xi_t + 20 |\ln(C_t / C_{t-1})|}

so :math:`0 < L_t \le O_t, C_t \le H_t` always, and volume is lognormal around one million and
larger on bars that move more. ``adj_close = close`` (no dividends).
"""

from __future__ import annotations

from enum import StrEnum

import numpy as np

from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, IntArray

START_DATE = "2020-01-01"
START_PRICE = 100.0
SHOCK_FACTOR = 0.85
VOLUME_BASE = 1e6


class Scenario(StrEnum):
    RANDOM_WALK = "random_walk"
    UPTREND = "uptrend"
    RANGE = "range"
    REVERSAL = "reversal"
    SHOCK = "shock"
    VOLATILITY_REGIME = "volatility_regime"


def _business_day_times(n: int) -> IntArray:
    days = np.busday_offset(np.datetime64(START_DATE, "D"), np.arange(n), roll="forward")
    return days.astype(np.int64) * SECONDS_PER_DAY


def _log_path(
    scenario: Scenario, eps: FloatArray, n: int
) -> tuple[FloatArray, FloatArray, FloatArray]:
    """(x_t - ln 100, sigma_t, ln J_t) of a scenario."""
    half = n // 2
    first = np.arange(n) < half
    jump = np.zeros(n)
    match scenario:
        case Scenario.RANDOM_WALK | Scenario.SHOCK:
            mu, sigma = np.full(n, 0.0003), np.full(n, 0.015)
            if scenario is Scenario.SHOCK:
                jump[half] = np.log(SHOCK_FACTOR)
        case Scenario.UPTREND:
            mu, sigma = np.full(n, 0.0015), np.full(n, 0.012)
        case Scenario.REVERSAL:
            mu, sigma = np.where(first, 0.0025, -0.0025), np.full(n, 0.012)
        case Scenario.VOLATILITY_REGIME:
            mu, sigma = np.zeros(n), np.where(first, 0.008, 0.03)
        case Scenario.RANGE:
            sigma, theta = np.full(n, 0.015), 0.08
            d = np.zeros(n)
            for t in range(1, n):  # recursive (AR(1)): no closed vectorised form without scipy
                d[t] = (1 - theta) * d[t - 1] + sigma[t] * eps[t]
            return d, sigma, jump
    r = mu + sigma * eps + jump
    r[0] = 0.0
    return np.cumsum(r), sigma, jump


def synthetic_bars(scenario: Scenario, seed: int, n: int = 500) -> BarFrame:
    """``n`` daily bars of ``scenario``; the same ``(scenario, seed, n)`` gives the same bars."""
    rng = np.random.default_rng(seed)
    eps, eta, nu, lam, xi = rng.standard_normal((5, n))
    d, sigma, jump = _log_path(scenario, eps, n)
    close = START_PRICE * np.exp(d)
    prev_close = np.concatenate(([START_PRICE], close[:-1]))
    open_ = prev_close * np.exp(jump + eta * sigma / 4)
    high = np.maximum(open_, close) * np.exp(np.abs(nu) * sigma / 2)
    low = np.minimum(open_, close) * np.exp(-np.abs(lam) * sigma / 2)
    volume = VOLUME_BASE * np.exp(0.3 * xi + 20 * np.abs(np.log(close / prev_close)))
    return BarFrame.from_columns(
        time=_business_day_times(n),
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
    )
