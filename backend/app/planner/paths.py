"""Simulated worlds for the planner: many possible histories to run one plan on.

A **world** is one realization of everything a plan depends on, on the plan's month dates
:math:`d_0, d_1, \\dots` (the first day moved by whole months): the assets of its market
accounts, the USD/ILS rate, the CPI, the dwelling price indices and the Bank of Israel rate.
Each of them is either **resampled from history** or **drawn from a model**.

**Block bootstrap.** History is a panel of months :math:`j = 0..n-1`: for every series the
growth over the month, :math:`g_j = v(t_{j+1}) / v(t_j)` at the month starts :math:`t_j`, and
the Bank of Israel rate's level in it. A world draws blocks of ``block`` consecutive months,
each starting at a month drawn evenly, and strings them together: month :math:`k` of the world
is month :math:`j(k)` of history *for every series at once*. So what moved together in a month
(stocks, the shekel, inflation, dwelling prices) moves together in the world, and trends shorter
than a block survive.

* A level series grows by the resampled growths from where it stands.
* The Bank of Israel rate is a level, not a growth: the level of month :math:`j(k)` travels
  with its block. High inflation then comes with the high rate it had, at the price of a jump
  where two blocks meet.
* An asset is resampled as three series: its price, its dividend factor (adjusted close over
  close) and the shekel rate of its currency, so the dividend tax still applies.

**Models.** A modelled series is lognormal with a yearly mean growth :math:`\\mu` and a yearly
log-volatility :math:`\\sigma`: its monthly log step is
:math:`\\ln(1 + \\mu)/12 - \\sigma^2/24 + (\\sigma/\\sqrt{12})\\,z`, :math:`z \\sim N(0, 1)`. The
:math:`-\\sigma^2/24` makes :math:`\\mu` the *expected* growth at any volatility, the same
convention as the apartment's assumed value. A modelled market is one such asset in shekels,
replacing every mix. The CPI's model is ``app.planner.inflation``.

An apartment whose value is modelled uses shocks :math:`\\rho z_m + \\sqrt{1 - \\rho^2}\\,z_h`,
with :math:`z_m` the market's shocks of the same months and :math:`z_h` its own: a correlation
:math:`\\rho` with a modelled market (none with a resampled one, whose months are history's).

**Estimating a model from history.** For monthly growths :math:`g_j` with log mean :math:`m`
and log variance :math:`s^2`: :math:`\\sigma = s\\sqrt{12}` and
:math:`\\mu = e^{12(m + s^2/2)} - 1`.

**Daily bars.** The market account buys on days, so an asset's price and shekel rate grow
evenly (geometrically) between two month dates; its dividends are paid on the month dates.

**One world, one seed.** World number :math:`i` is drawn from the seed and :math:`i` alone,
each kind of draw from its own stream and always for the longest plan allowed. So both options
see the same world, a longer plan sees the same world further, and changing the plan does not
change the worlds.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import timedelta

import numpy as np

from app.models.bars import FloatArray, IntArray
from app.planner.data import InflationSpec
from app.planner.deposits import EPOCH, add_months, day_number
from app.planner.inflation import CpiPath, assumed_cpi
from app.planner.market import AssetData, PlanError

#: The longest plan a world is drawn for (months).
MAX_MONTHS = 1200
#: The streams of a world's generator.
BLOCKS, MARKET, HOMES, INFLATION = range(4)


@dataclass(frozen=True, slots=True)
class Panel:
    """Monthly history: month starts :math:`t_0..t_n`, each series' growth over every month,
    and the Bank of Israel rate's level (a fraction) in it."""

    months: IntArray
    ratios: Mapping[str, FloatArray]
    rate: FloatArray | None = None

    def __len__(self) -> int:
        return len(self.months) - 1


@dataclass(frozen=True, slots=True)
class WorldSpec:
    """What every world of a simulation is made of."""

    #: The plan's first day, and how many months of it a world covers.
    first: int
    months: int
    seed: int = 1
    block: int = 12
    panel: Panel | None = None
    #: The assets to resample, by their key in the panel (``<key>/close``, ``/factor``, ``/fx``).
    assets: Mapping[str, AssetData] = field(default_factory=dict[str, AssetData])
    #: A modelled market (yearly mean growth, yearly volatility) instead of the assets.
    market: tuple[float, float] | None = None
    inflation: InflationSpec = field(default_factory=InflationSpec)
    #: The dwelling indices to resample (panel keys).
    dwellings: Sequence[str] = ()
    #: The last published Bank of Israel rate (None: the rate is not resampled).
    rate_now: float | None = None
    #: Between the shocks of a modelled apartment value and those of a modelled market.
    correlation: float = 0.0


@dataclass(frozen=True, slots=True)
class World:
    #: The month dates :math:`d_0..d_K`.
    days: IntArray
    cpi: CpiPath
    assets: Mapping[str, AssetData]
    market: AssetData | None
    #: Index levels on the month dates (1 on the first).
    dwellings: Mapping[str, FloatArray]
    #: The Bank of Israel rate in each month, and the one the entered rates belong to.
    rate: FloatArray | None
    rate_now: float | None
    #: Unit normals for modelled values: the market's, and one row per apartment.
    market_shocks: FloatArray
    home_shocks: FloatArray
    correlation: float = 0.0


def monthly(days: IntArray, values: FloatArray, months: IntArray) -> FloatArray:
    """The series on each of ``months``: its last value on or before it (NaN before the first)."""
    index = np.searchsorted(days, months, side="right") - 1
    return np.where(index >= 0, values[np.maximum(index, 0)], np.nan)


def block_index(rng: np.random.Generator, n: int, block: int) -> IntArray:
    """``MAX_MONTHS`` months of history (indices below ``n``) in blocks of ``block``."""
    if block < 1 or n < block:
        raise PlanError(f"History holds {n} months: too few for blocks of {block}")
    starts = rng.integers(0, n - block + 1, size=-(-MAX_MONTHS // block))
    return (starts[:, None] + np.arange(block)[None, :]).ravel()[:MAX_MONTHS]


def lognormal(mean: float, sd: float, shocks: FloatArray) -> FloatArray:
    """A path that starts at 1 and takes one monthly step per shock (along the last axis)."""
    steps = np.log1p(mean) / 12.0 - sd * sd / 24.0 + sd / np.sqrt(12.0) * shocks
    start = np.zeros((*steps.shape[:-1], 1))
    return np.exp(np.concatenate((start, np.cumsum(steps, axis=-1)), axis=-1))


def estimate(ratios: FloatArray) -> tuple[float, float]:
    """The yearly mean growth and volatility of the model that fits monthly growths."""
    logs = np.log(ratios)
    variance = float(np.var(logs, ddof=1))
    return float(np.expm1(12.0 * (np.mean(logs) + variance / 2.0))), float(np.sqrt(12 * variance))


def daily(grid: IntArray, levels: FloatArray, days: IntArray) -> FloatArray:
    """Levels on ``days`` that grow evenly between the ``grid`` days they are given on."""
    k = np.clip(np.searchsorted(grid, days, side="right") - 1, 0, len(grid) - 2)
    share = (days - grid[k]) / (grid[k + 1] - grid[k])
    return levels[k] * (levels[k + 1] / levels[k]) ** share


def make_world(spec: WorldSpec, index: int) -> World:
    """World number ``index`` of the simulation (see the module docstring)."""
    if not 1 <= spec.months <= MAX_MONTHS:
        raise PlanError(f"A simulated plan runs for 1 to {MAX_MONTHS} months")

    def stream(kind: int) -> np.random.Generator:
        return np.random.default_rng([spec.seed, index, kind])

    first = EPOCH + timedelta(days=spec.first)
    grid = np.array(
        [day_number(add_months(first, k)) for k in range(spec.months + 1)], dtype=np.int64
    )
    days = np.arange(grid[0], grid[-1] + 1, dtype=np.int64)
    ones = np.ones(len(days))
    panel = spec.panel
    came_from = (
        None
        if panel is None
        else block_index(stream(BLOCKS), len(panel), spec.block)[: spec.months]
    )

    def resampled(name: str, start: float = 1.0) -> FloatArray:
        assert panel is not None and came_from is not None  # noqa: S101, PT018 - by the caller
        return start * np.concatenate(([1.0], np.cumprod(panel.ratios[name][came_from])))

    assets: dict[str, AssetData] = {}
    market = None
    market_shocks = stream(MARKET).standard_normal(MAX_MONTHS)
    if spec.market is not None:
        close = daily(grid, lognormal(*spec.market, market_shocks[: spec.months]), days)
        market = AssetData("MARKET", 1.0, days, close, close, close, close, ones, ones)
    else:
        for key, source in spec.assets.items():
            close = daily(grid, resampled(f"{key}/close"), days)
            # Dividends on the month dates: the factor is a step, not a slope.
            factor = resampled(f"{key}/factor")[np.searchsorted(grid, days, side="right") - 1]
            fx = daily(grid, resampled(f"{key}/fx", float(source.fx[-1])), days)
            assets[key] = AssetData(
                source.symbol, source.weight, days, close, close, close, close, factor, fx,
                source.dividend_yield,
            )  # fmt: skip
    if spec.inflation.mode == "historical":
        cpi = CpiPath(grid, 100.0 * resampled("cpi"))
    else:
        cpi = assumed_cpi(
            int(grid[0]),
            int(grid[-1]),
            mu=spec.inflation.mean,
            sigma=spec.inflation.sd,
            phi=spec.inflation.persistence,
            rng=stream(INFLATION),
        )
    rate = None
    if spec.rate_now is not None and panel is not None and panel.rate is not None:
        assert came_from is not None  # noqa: S101 - set with the panel
        rate = panel.rate[came_from]
    return World(
        days=grid,
        cpi=cpi,
        assets=assets,
        market=market,
        dwellings={name: resampled(name) for name in spec.dwellings},
        rate=rate,
        rate_now=spec.rate_now,
        market_shocks=market_shocks,
        home_shocks=stream(HOMES).standard_normal((2, MAX_MONTHS)),
        correlation=spec.correlation if spec.market is not None else 0.0,
    )
