r"""Bars of a synthetic symbol: hourly bars that aggregate to the scenario's daily bars (ADR 0031).

**Daily closes.** Day :math:`t = 0 \ldots n-1` draws its own row of standard normals from
``numpy.random.default_rng(seed)`` (an ``(n, 24)`` block, so a day's draws do not depend on
:math:`n`). The first column :math:`\varepsilon_t` feeds the lab scenario's daily recursion
(``app.analysis.synthetic.log_path``), which gives :math:`d_t = x_t - \ln 100`, the daily
:math:`\sigma_t` and the jump :math:`\ln J_t`. With :math:`P_0` the first price,

.. math::
    C_t = P_0 e^{d_t}, \qquad C_{-1} = P_0, \qquad
    O_t = C_{t-1} J_t e^{\eta_t \sigma_t / 4}

exactly as the lab's daily bars (so every scenario keeps its documented drift, volatility,
mean reversion and regimes). Scenarios that switch at :math:`h = \lfloor n/2 \rfloor` (``reversal``,
``shock``, ``volatility_regime``, ``regimes``) depend on :math:`n`; the others do not, so a longer
series starts with the shorter one.

**Hours.** A session has seven bars, 09:30 to 16:00 New York (the last one half an hour), with
lengths :math:`w = (1, 1, 1, 1, 1, 1, \tfrac12) / 6.5` of the day and ends
:math:`s_k = \sum_{i \le k} w_i` (:math:`s_0 = 0`, :math:`s_7 = 1`). The log price runs from
:math:`\ln O_t` to :math:`\ln C_t` along a Brownian bridge scaled by the day's :math:`\sigma_t`:

.. math::
    W_k = \sum_{i \le k} \sqrt{w_i}\, z_{t,i}, \qquad
    \ell_k = \ln O_t + s_k (\ln C_t - \ln O_t) + \sigma_t (W_k - s_k W_7)

so :math:`\ell_0 = \ln O_t` and :math:`\ell_7 = \ln C_t` exactly. Bar :math:`k` opens at
:math:`e^{\ell_{k-1}}` and closes at :math:`e^{\ell_k}`; its wicks are the lab's, scaled to the bar:

.. math::
    H_{t,k} = \max(o, c)\, e^{|\nu_{t,k}| \sigma_t \sqrt{w_k} / 2}, \qquad
    L_{t,k} = \min(o, c)\, e^{-|\lambda_{t,k}| \sigma_t \sqrt{w_k} / 2}

The day's volume is the lab's,
:math:`V_t = 10^6 e^{0.3 \xi_t + 20 |\ln(C_t / C_{t-1})| + 0.8 k_t \operatorname{sign}(\ln(C_t /
C_{t-1}))}`, spread over the hours by the lab's U-shaped profile.

**Days.** The daily bar is the aggregate of its hours: the first open (:math:`O_t`), the highest
high, the lowest low, the last close (:math:`C_t`) and the summed volume. ``adj_close = close``.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

from app.analysis.synthetic import VOLUME_BASE, VOLUME_PROFILE, log_path, volume_skew
from app.models.bars import SECONDS_PER_DAY, BarFrame, IntArray
from app.models.synthetic import MAX_DEFINITIONS, ScenarioDefinition

TIMEZONE = "America/New_York"
SESSION_BARS = 7
#: Bar lengths as shares of the 6.5-hour session (the last bar is 15:30-16:00).
WEIGHTS = np.array([1, 1, 1, 1, 1, 1, 0.5]) / 6.5
OPEN_MINUTES = 9 * 60 + 30
#: Columns of a day's draws: eps, eta, xi, then seven each of z (bridge), nu and lambda.
_DRAWS = 3 + 3 * SESSION_BARS


def hourly_bars(definition: ScenarioDefinition) -> BarFrame:
    """The 1h bars of ``definition`` (seven per session), oldest first."""
    return _hourly(definition.model_dump_json())


def daily_bars(definition: ScenarioDefinition) -> BarFrame:
    """The daily bars of ``definition``: each the aggregate of its session's 1h bars."""
    return _daily(definition.model_dump_json())


# Memoised by the whole definition (its JSON), so an edit is a new key: the ~20 ms of a series of
# 10,000 sessions is spent once, not on every quote poll. Callers never write into a BarFrame.
@lru_cache(maxsize=4)
def _hourly(key: str) -> BarFrame:
    definition = ScenarioDefinition.model_validate_json(key)
    n = definition.bars
    draws = np.random.default_rng(definition.seed).standard_normal((n, _DRAWS))
    eps, eta, xi = draws[:, 0], draws[:, 1], draws[:, 2]
    z, nu, lam = (draws[:, 3 + SESSION_BARS * i : 3 + SESSION_BARS * (i + 1)] for i in range(3))

    d, sigma, jump = log_path(definition.scenario, eps, n)
    close = definition.first_price * np.exp(d)
    prev_close = np.concatenate(([definition.first_price], close[:-1]))
    day_open = prev_close * np.exp(jump + eta * sigma / 4)

    ends = np.cumsum(WEIGHTS)
    walk = np.cumsum(np.sqrt(WEIGHTS) * z, axis=1)
    bridge = walk - ends * walk[:, -1:]
    log_open, log_close = np.log(day_open)[:, None], np.log(close)[:, None]
    level = log_open + ends * (log_close - log_open) + sigma[:, None] * bridge
    level[:, -1] = log_close[:, 0]  # exact, not just up to rounding
    bar_close = np.exp(level)
    bar_open = np.concatenate([day_open[:, None], bar_close[:, :-1]], axis=1)
    wick = sigma[:, None] * np.sqrt(WEIGHTS) / 2
    high = np.maximum(bar_open, bar_close) * np.exp(np.abs(nu) * wick)
    low = np.minimum(bar_open, bar_close) * np.exp(-np.abs(lam) * wick)

    log_move = np.log(close / prev_close)
    day_volume = VOLUME_BASE * np.exp(
        0.3 * xi
        + 20 * np.abs(log_move)
        + 0.8 * volume_skew(definition.scenario, n) * np.sign(log_move)
    )
    volume = day_volume[:, None] * VOLUME_PROFILE / VOLUME_PROFILE.sum()

    return BarFrame.from_columns(
        time=_hour_starts(definition).ravel(),
        open=bar_open.ravel(),
        high=high.ravel(),
        low=low.ravel(),
        close=bar_close.ravel(),
        volume=volume.ravel(),
    )


@lru_cache(maxsize=MAX_DEFINITIONS)
def _daily(key: str) -> BarFrame:
    definition = ScenarioDefinition.model_validate_json(key)
    hours = _hourly(key)
    shape = (definition.bars, SESSION_BARS)
    return BarFrame.from_columns(
        time=_session_days(definition) * SECONDS_PER_DAY,
        open=hours.open.reshape(shape)[:, 0],
        high=hours.high.reshape(shape).max(axis=1),
        low=hours.low.reshape(shape).min(axis=1),
        close=hours.close.reshape(shape)[:, -1],
        volume=hours.volume.reshape(shape).sum(axis=1),
    )


def _session_days(definition: ScenarioDefinition) -> IntArray:
    """Day numbers of the sessions: ``bars`` weekdays from ``first_date`` (rolled forward)."""
    first = np.datetime64(definition.first_date, "D")
    return np.busday_offset(first, np.arange(definition.bars), roll="forward").astype(np.int64)


def _hour_starts(definition: ScenarioDefinition) -> IntArray:
    """UTC start of each 1h bar, ``(bars, 7)``: 09:30 + k hours New York time (DST-aware)."""
    days = _session_days(definition)
    local = (
        days[:, None] * SECONDS_PER_DAY
        + OPEN_MINUTES * 60
        + np.arange(SESSION_BARS, dtype=np.int64) * 3600
    )
    wall = pd.DatetimeIndex(pd.to_datetime(local.ravel(), unit="s"))
    utc = wall.tz_localize(TIMEZONE).tz_convert("UTC").as_unit("s").asi8
    return utc.astype(np.int64).reshape(local.shape)
