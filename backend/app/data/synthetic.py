r"""Bars of a synthetic symbol: hourly bars that aggregate to its daily bars (ADR 0031, 0032).

Two kinds share the hours and the days below; they differ in the daily close.

**A lab scenario's daily closes (K0).** Day :math:`t = 0 \ldots n-1` draws its own row of standard
normals from ``numpy.random.default_rng(seed)`` (an ``(n, 24)`` block, so a day's draws do not
depend on :math:`n`). The first column :math:`\varepsilon_t` feeds the lab scenario's daily
recursion (``app.analysis.synthetic.log_path``), which gives :math:`d_t = x_t - \ln 100`, the daily
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

**A dwelling price index's daily closes (K1).** The index has values :math:`I_j` on month dates
:math:`M_j` (day numbers), :math:`j = 0 \ldots J-1`, and
:math:`\lambda_j = \ln P_0 + \ln(I_j / I_0)` puts its first value at the first price. The close
runs between **anchors** :math:`A_j < E_j` from :math:`a_j` to :math:`b_j`:

* interpolated (default): :math:`A_j = M_j`, :math:`E_j = M_{j+1}`, :math:`a_j = \lambda_j`,
  :math:`b_j = \lambda_{j+1}`, for :math:`j \le J-2`, then the last month alone at
  :math:`\lambda_{J-1}` (geometric between month dates, so a day uses the **next** month's value);
* causal: :math:`A_j = M_j + L` months (the assumed publication), :math:`E_j = A_{j+1}`,
  :math:`a_j = b_j = \lambda_j`, and no bar on or after today: a day uses only values published by
  then. Past the last value, one more assumed publication a month holds it until yesterday.

Time runs in weekdays (the bars'): on the weekdays :math:`d` of :math:`[A_j, E_j)`, with :math:`k`
the weekdays from :math:`A_j` to :math:`d` and :math:`\tau_j` those of the whole segment, the close
moves by :math:`k / \tau_j` of the way, and the noise :math:`\sigma` (a day) adds a Brownian bridge
that is zero on the anchors. An anchor on a weekend lands on the next weekday, so every value of
the index, the last one included, is a close:

.. math::
    \ln C_d = a_j + \frac{k}{\tau_j}(b_j - a_j) + \beta_k, \qquad
    \beta_k = W_k - \frac{k}{\tau_j} W_{\tau_j}, \qquad W_k = \sigma \sum_{i=1}^{k} z_i

Segment :math:`j` draws from ``default_rng([seed, j])`` (rows of 24 as above, row :math:`k` for
day :math:`k`, row :math:`\tau_j` for :math:`z_{\tau_j}`), so a new month leaves every earlier bar
as it was (in causal mode, unless the value arrives after its assumed publication: the bars from
that publication, which held the previous value, then take it). The day's open is
:math:`O_d = C_{d-1} e^{\eta_d \sigma / 4}` (:math:`O = C` on the first day), the hours and wicks
are the ones below with :math:`\sigma_t = \sigma`, and there is no volume.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache

import numpy as np
import pandas as pd

from app.analysis.synthetic import VOLUME_BASE, VOLUME_PROFILE, log_path, volume_skew
from app.data.sessions import session_days
from app.data.synthetic_returns import parametric_returns
from app.macro.series import MacroSeries
from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, IntArray, date_to_ts
from app.models.synthetic import (
    MAX_DEFINITIONS,
    DwellingDefinition,
    ParametricDefinition,
    ScenarioDefinition,
)
from app.planner.deposits import add_months

TIMEZONE = "America/New_York"
SESSION_BARS = 7
#: Bar lengths as shares of the 6.5-hour session (the last bar is 15:30-16:00).
WEIGHTS = np.array([1, 1, 1, 1, 1, 1, 0.5]) / 6.5
OPEN_MINUTES = 9 * 60 + 30
#: Columns of a day's draws: eps, eta, xi, then seven each of z (bridge), nu and lambda.
_DRAWS = 3 + 3 * SESSION_BARS


def hourly_bars(definition: ScenarioDefinition) -> BarFrame:
    """The 1h bars of a scenario symbol (seven per session), oldest first."""
    return _hourly(definition.model_dump_json())


def daily_bars(definition: ScenarioDefinition) -> BarFrame:
    """The daily bars of a scenario symbol: each the aggregate of its session's 1h bars."""
    return _daily(definition.model_dump_json())


def dwelling_hourly(definition: DwellingDefinition, index: MacroSeries, today: date) -> BarFrame:
    """The 1h bars of a dwelling symbol from its index's monthly values."""
    return _dwelling_hourly(*_dwelling_key(definition, index, today))


def dwelling_daily(definition: DwellingDefinition, index: MacroSeries, today: date) -> BarFrame:
    """The daily bars of a dwelling symbol: each the aggregate of its session's 1h bars."""
    return _dwelling_daily(*_dwelling_key(definition, index, today))


def parametric_hourly(definition: ParametricDefinition) -> BarFrame:
    """The 1h bars of a parametric symbol (its returns: ``app.data.synthetic_returns``)."""
    return _parametric_hourly(definition.model_dump_json())


def parametric_daily(definition: ParametricDefinition) -> BarFrame:
    """The daily bars of a parametric symbol: each the aggregate of its session's 1h bars."""
    return _aggregate(_parametric_hourly(definition.model_dump_json()))


# Memoised by the whole definition (its JSON) and, for a dwelling symbol, its index's values: an
# edit or a new month is a new key. The ~20 ms of a series of 10,000 sessions is spent once, not
# on every quote poll. The arrays are read-only (shared).
@lru_cache(maxsize=4)
def _hourly(key: str) -> BarFrame:
    definition = ScenarioDefinition.model_validate_json(key)
    n = definition.bars
    draws = np.random.default_rng(definition.seed).standard_normal((n, _DRAWS))
    eps, eta, xi = draws[:, 0], draws[:, 1], draws[:, 2]
    d, sigma, jump = log_path(definition.scenario, eps, n)
    close = definition.first_price * np.exp(d)
    prev_close = np.concatenate(([definition.first_price], close[:-1]))
    day_open = prev_close * np.exp(jump + eta * sigma / 4)
    log_move = np.log(close / prev_close)
    day_volume = VOLUME_BASE * np.exp(
        0.3 * xi
        + 20 * np.abs(log_move)
        + 0.8 * volume_skew(definition.scenario, n) * np.sign(log_move)
    )
    return _sessions(_session_days(definition), day_open, close, sigma, draws, day_volume)


@lru_cache(maxsize=MAX_DEFINITIONS)
def _daily(key: str) -> BarFrame:
    return _aggregate(_hourly(key))


@lru_cache(maxsize=4)
def _parametric_hourly(key: str) -> BarFrame:
    definition = ParametricDefinition.model_validate_json(key)
    n = definition.bars
    path = parametric_returns(definition, n - 1, definition.seed)
    close = definition.first_price * np.cumprod(np.concatenate(([1.0], 1 + path.returns)))
    draws = np.random.default_rng([definition.seed, 0]).standard_normal((n, _DRAWS))
    sigma = np.concatenate((path.sigma[:1], path.sigma))
    # A day's jump shows in its open (news overnight), its gap scaled to the day's volatility.
    gap = np.exp(draws[1:, 1] * sigma[1:] / 4) * np.maximum(1 + path.jumps, 0.05)
    day_open = np.concatenate((close[:1], close[:-1] * gap))
    log_move = np.abs(np.log(close / np.concatenate((close[:1], close[:-1]))))
    day_volume = VOLUME_BASE * np.exp(0.3 * draws[:, 2] + 20 * log_move)
    return _sessions(_session_days(definition), day_open, close, sigma, draws, day_volume)


_DwellingKey = tuple[str, tuple[int, ...], tuple[float, ...], int]


def _dwelling_key(definition: DwellingDefinition, index: MacroSeries, today: date) -> _DwellingKey:
    # Today matters only to a causal series (it ends before today): elsewhere 0 keeps one key.
    until = date_to_ts(today) // SECONDS_PER_DAY if definition.causal else 0
    days = tuple(int(d) for d in index.days)
    return definition.model_dump_json(), days, tuple(float(v) for v in index.values), until


@lru_cache(maxsize=4)
def _dwelling_hourly(
    key: str, months: tuple[int, ...], values: tuple[float, ...], until: int
) -> BarFrame:
    definition = DwellingDefinition.model_validate_json(key)
    days, close, draws = dwelling_closes(
        definition, np.array(months, dtype=np.int64), np.array(values), until
    )
    sigma = np.full(len(days), definition.noise_pct / 100)
    day_open = np.concatenate((close[:1], close[:-1] * np.exp(draws[1:, 1] * sigma[1:] / 4)))
    return _sessions(days, day_open, close, sigma, draws, np.zeros(len(days)))


@lru_cache(maxsize=MAX_DEFINITIONS)
def _dwelling_daily(
    key: str, months: tuple[int, ...], values: tuple[float, ...], until: int
) -> BarFrame:
    return _aggregate(_dwelling_hourly(key, months, values, until))


def dwelling_closes(
    definition: DwellingDefinition, months: IntArray, values: FloatArray, until: int
) -> tuple[IntArray, FloatArray, FloatArray]:
    """``(days, closes, draws)`` of a dwelling symbol: the weekdays it has a bar on, the close of
    each, and each day's row of 24 normals (for its open and hours). ``until`` (a day number) is
    the first day a causal series has no bar on."""
    level = np.log(definition.first_price) + np.log(values / values[0])
    sigma = definition.noise_pct / 100
    if definition.causal:
        published = np.array(
            [_day_number(add_months(_date(m), definition.lag_months)) for m in months]
        )
        # Past the last value, one assumed publication a month holds it until the day before
        # ``until`` (the data may lag); a value that arrives later replaces the hold from then.
        while published[-1] < until:
            published = np.append(published, _day_number(add_months(_date(published[-1]), 1)))
            level = np.append(level, level[-1])
        anchors, ends = published[:-1], published[1:]
        start_level, end_level = level[:-1], level[:-1]
    else:
        anchors, ends = months[:-1], months[1:]
        start_level, end_level = level[:-1], level[1:]
    out_days: list[IntArray] = []
    out_close: list[FloatArray] = []
    out_draws: list[FloatArray] = []
    for j, (a, e) in enumerate(zip(anchors, ends, strict=True)):
        tau = int(np.busday_count(_d64(a), _d64(e)))
        if tau == 0:
            continue
        draws = np.random.default_rng([definition.seed, j]).standard_normal((tau + 1, _DRAWS))
        walk = sigma * np.concatenate(([0.0], np.cumsum(draws[1:, 0])))  # W_0 .. W_tau
        days = np.busday_offset(_d64(a), np.arange(tau), roll="forward").astype(np.int64)
        k = np.arange(tau)
        bridge = walk[:tau] - k / tau * walk[tau]
        share = k / tau
        log_close = start_level[j] + share * (end_level[j] - start_level[j]) + bridge
        keep = days < until if definition.causal else np.ones(tau, dtype=bool)
        out_days.append(days[keep])
        out_close.append(np.exp(log_close[keep]))
        out_draws.append(draws[:tau][keep])
    if not definition.causal:
        # The last month alone, at its value, on its date or the next weekday; its draws are the
        # row of the segment it will open when the next month arrives.
        last = len(months) - 1
        row = np.random.default_rng([definition.seed, last]).standard_normal((1, _DRAWS))
        out_days.append(np.busday_offset(_d64(months[-1]), [0], roll="forward").astype(np.int64))
        out_close.append(np.exp(level[-1:]))
        out_draws.append(row)
    if not out_days:
        return np.empty(0, dtype=np.int64), np.empty(0), np.empty((0, _DRAWS))
    return np.concatenate(out_days), np.concatenate(out_close), np.concatenate(out_draws)


def _sessions(
    days: IntArray,
    day_open: FloatArray,
    close: FloatArray,
    sigma: FloatArray,
    draws: FloatArray,
    day_volume: FloatArray,
) -> BarFrame:
    """The seven 1h bars of each day, from its open to its close (draws: columns 3 to 23)."""
    z, nu, lam = (draws[:, 3 + SESSION_BARS * i : 3 + SESSION_BARS * (i + 1)] for i in range(3))
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
    volume = day_volume[:, None] * VOLUME_PROFILE / VOLUME_PROFILE.sum()
    return _read_only(
        BarFrame.from_columns(
            time=_hour_starts(days).ravel(),
            open=bar_open.ravel(),
            high=high.ravel(),
            low=low.ravel(),
            close=bar_close.ravel(),
            volume=volume.ravel(),
        )
    )


def _aggregate(hours: BarFrame) -> BarFrame:
    """The daily bars of whole sessions of seven 1h bars."""
    shape = (len(hours) // SESSION_BARS, SESSION_BARS)
    days = session_days(hours.time, TIMEZONE)[::SESSION_BARS]
    return _read_only(
        BarFrame.from_columns(
            time=days * SECONDS_PER_DAY,
            open=hours.open.reshape(shape)[:, 0],
            high=hours.high.reshape(shape).max(axis=1),
            low=hours.low.reshape(shape).min(axis=1),
            close=hours.close.reshape(shape)[:, -1],
            volume=hours.volume.reshape(shape).sum(axis=1),
        )
    )


def _read_only(frame: BarFrame) -> BarFrame:
    """The memoised frames are shared: a write into one is an error, not a corrupted series."""
    for column in (frame.time, frame.open, frame.high, frame.low, frame.close, frame.volume):
        column.flags.writeable = False
    frame.adj_close.flags.writeable = False
    return frame


def _session_days(definition: ScenarioDefinition | ParametricDefinition) -> IntArray:
    """Day numbers of the sessions: ``bars`` weekdays from ``first_date`` (rolled forward)."""
    first = np.datetime64(definition.first_date, "D")
    return np.busday_offset(first, np.arange(definition.bars), roll="forward").astype(np.int64)


def _hour_starts(days: IntArray) -> IntArray:
    """UTC start of each 1h bar, ``(days, 7)``: 09:30 + k hours New York time (DST-aware)."""
    local = (
        days[:, None] * SECONDS_PER_DAY
        + OPEN_MINUTES * 60
        + np.arange(SESSION_BARS, dtype=np.int64) * 3600
    )
    wall = pd.DatetimeIndex(pd.to_datetime(local.ravel(), unit="s"))
    utc = wall.tz_localize(TIMEZONE).tz_convert("UTC").as_unit("s").asi8
    return utc.astype(np.int64).reshape(local.shape)


def _d64(day: int | np.integer) -> np.datetime64:
    return np.datetime64(int(day), "D")


def _date(day: int | np.integer) -> date:
    return date.fromisoformat(str(_d64(day)))


def _day_number(day: date) -> int:
    return date_to_ts(day) // SECONDS_PER_DAY
