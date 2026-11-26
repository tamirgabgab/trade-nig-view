"""Simulated worlds: resampled blocks of history and modelled paths."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from app.models.bars import FloatArray
from app.planner.data import InflationSpec
from app.planner.deposits import add_months, day_number
from app.planner.home import assumed_values
from app.planner.market import AssetData
from app.planner.paths import (
    MAX_MONTHS,
    Panel,
    WorldSpec,
    block_index,
    daily,
    estimate,
    lognormal,
    make_world,
    monthly,
)

FIRST = date(2020, 1, 15)


def month_starts(first: date, count: int) -> np.ndarray:
    return np.array([day_number(add_months(first, k)) for k in range(count)], dtype=np.int64)


# ---------------------------------------------------------------- the pieces


def test_a_series_at_month_starts_is_its_last_value_on_or_before_each() -> None:
    days = np.array([day_number(date(2020, 1, 3)), day_number(date(2020, 1, 31)),
                     day_number(date(2020, 2, 1)), day_number(date(2020, 3, 20))])  # fmt: skip
    values = np.array([10.0, 11.0, 12.0, 13.0])
    months = month_starts(date(2020, 1, 1), 4)  # Jan 1 is before the first value
    assert monthly(days, values, months)[1:] == pytest.approx([12.0, 12.0, 13.0])
    assert np.isnan(monthly(days, values, months)[0])


def test_blocks_are_runs_of_consecutive_months_from_history() -> None:
    index = block_index(np.random.default_rng(3), n=100, block=12)
    assert len(index) == MAX_MONTHS
    assert index.min() >= 0
    assert index.max() <= 99
    steps = np.diff(index).reshape(-1)
    inside = np.arange(1, MAX_MONTHS) % 12 != 0
    assert np.all(steps[inside] == 1)  # inside a block the months follow each other
    assert not np.all(steps[~inside] == 1)  # and a new block starts anywhere
    assert np.array_equal(index, block_index(np.random.default_rng(3), n=100, block=12))
    assert not np.array_equal(index, block_index(np.random.default_rng(4), n=100, block=12))
    # A block as long as the history is the history itself.
    assert np.array_equal(block_index(np.random.default_rng(1), n=24, block=24)[:24], np.arange(24))


def test_a_modelled_path_grows_by_its_mean_and_matches_the_apartments_convention() -> None:
    assert lognormal(0.06, 0.0, np.zeros(24)) == pytest.approx(1.06 ** (np.arange(25) / 12))
    shocks = np.random.default_rng(5).standard_normal(120)
    same = assumed_values(120, 0.03, 0.08, np.random.default_rng(5))
    assert lognormal(0.03, 0.08, shocks) == pytest.approx(same, rel=1e-12)
    # The mean is the expected growth, not the median's: 6 % a year at any volatility.
    year = lognormal(0.06, 0.2, np.random.default_rng(6).standard_normal((40_000, 12)))[:, -1]
    assert year.mean() == pytest.approx(1.06, abs=4 * 0.2 / 40_000**0.5)


def test_the_estimate_of_a_mix_returns_the_models_parameters() -> None:
    assert estimate(np.full(60, 1.05 ** (1 / 12))) == pytest.approx((0.05, 0.0), abs=1e-12)
    # 240,000 single months of the model (one long path would overflow).
    months = lognormal(0.07, 0.15, np.random.default_rng(7).standard_normal((240_000, 1)))
    mean, sd = estimate(months[:, 1])
    assert mean == pytest.approx(0.07, abs=0.005)
    assert sd == pytest.approx(0.15, abs=0.002)


def test_daily_values_grow_evenly_between_month_dates() -> None:
    grid = np.array([0, 10, 30])
    levels = np.array([1.0, 2.0, 8.0])
    assert daily(grid, levels, np.array([0, 5, 10, 20, 30])) == pytest.approx(
        [1.0, 2**0.5, 2.0, 4.0, 8.0]
    )


# ---------------------------------------------------------------- a world


def asset(symbol: str, close: np.ndarray, factor: np.ndarray, fx: np.ndarray) -> AssetData:
    days = month_starts(date(2000, 1, 1), len(close))
    return AssetData(symbol, 1.0, days, close, close, close, close, factor, fx)


def history(months: int = 120) -> tuple[Panel, dict[str, AssetData]]:
    """Ten years in which every series has its own recognisable monthly growth."""
    j = np.arange(months, dtype=np.float64)
    ratios = {
        "AAA/close": 1.001 + 0.001 * j,  # never flat: month j grows by j + 1 tenths of a percent
        "AAA/factor": 1.0 + 0.01 * (j % 3 == 0),
        "AAA/fx": 1.0 - 0.0001 * j,
        "cpi": 1.0 + 0.00001 * j,
        "dwelling": 1.0 + 0.00002 * j,
    }
    ones = np.ones(2)
    source = {"AAA": asset("AAA", ones, ones, 3.5 * ones)}
    return Panel(month_starts(date(2000, 1, 1), months + 1), ratios, 0.02 + 0.0001 * j), source


def spec(months: int = 60, **changes: object) -> WorldSpec:
    panel, assets = history()
    base: dict[str, object] = {
        "first": day_number(FIRST),
        "months": months,
        "panel": panel,
        "assets": assets,
        "inflation": InflationSpec("historical"),
        "dwellings": ("dwelling",),
        "rate_now": 0.03,
    }
    return WorldSpec(**{**base, **changes})  # type: ignore[arg-type]


def test_a_world_keeps_the_months_of_history_together() -> None:
    panel, _ = history()
    world = make_world(spec(), 0)
    grid = month_starts(FIRST, 61)
    assert np.array_equal(world.days, grid)
    a = world.assets["AAA"]
    at = np.searchsorted(a.days, grid)
    # The month each step came from, read back from the asset's own growth.
    came_from = np.rint((a.close[at][1:] / a.close[at][:-1] - 1.0) / 0.001).astype(int) - 1
    assert came_from.min() >= 0
    assert came_from.max() <= 119
    assert np.all(np.diff(came_from)[np.arange(1, 60) % 12 != 0] == 1)
    for name, levels in (
        ("AAA/factor", a.factor[at]),
        ("AAA/fx", a.fx[at]),
        ("cpi", world.cpi.at(grid)),
        ("dwelling", world.dwellings["dwelling"]),
    ):
        assert levels[1:] / levels[:-1] == pytest.approx(panel.ratios[name][came_from]), name
    assert world.rate is not None
    assert panel.rate is not None
    assert world.rate[:60] == pytest.approx(panel.rate[came_from])  # the level travels with it
    assert world.rate_now == 0.03
    assert a.fx[0] == 3.5  # the shekel rate starts where the history ends
    assert world.market is None


def test_dividends_stay_on_month_dates_and_prices_fill_the_days_between() -> None:
    a = make_world(spec(), 0).assets["AAA"]
    assert np.array_equal(a.days, np.arange(int(a.days[0]), int(a.days[-1]) + 1))
    grid = month_starts(FIRST, 61)
    on_grid = np.isin(a.days, grid)
    steps = a.factor[1:] / a.factor[:-1]
    assert np.all(steps[~on_grid[1:]] == 1.0)
    assert np.all(np.diff(np.log(a.close)) > 0)  # no flat stretch, no jump back


def test_a_world_depends_only_on_the_seed_and_its_number() -> None:
    def closes(world_spec: WorldSpec, index: int) -> FloatArray:
        return make_world(world_spec, index).assets["AAA"].close

    assert np.array_equal(closes(spec(), 3), closes(spec(), 3))
    assert not np.array_equal(closes(spec(), 3), closes(spec(), 4))
    assert not np.array_equal(closes(spec(), 3), closes(spec(seed=2), 3))
    # A longer plan sees the same world, further.
    short, long = closes(spec(60), 3), closes(spec(120), 3)
    assert np.array_equal(short[:-1], long[: len(short) - 1])


def test_a_modelled_market_replaces_the_mix_and_inflation_can_be_modelled_too() -> None:
    world = make_world(spec(market=(0.06, 0.0), inflation=InflationSpec(mean=0.02)), 0)
    assert world.market is not None
    grid = month_starts(FIRST, 61)
    at = np.searchsorted(world.market.days, grid)
    assert world.market.close[at] == pytest.approx(1.06 ** (np.arange(61) / 12))
    assert np.all(world.market.fx == 1.0)
    assert float(world.cpi.at(grid[24]) / world.cpi.at(grid[12])) == pytest.approx(1.02)
    noisy = spec(market=(0.06, 0.2), inflation=InflationSpec(mean=0.02, sd=0.01))
    one, two = make_world(noisy, 0), make_world(noisy, 1)
    assert one.market is not None
    assert two.market is not None
    assert not np.array_equal(one.market.close, two.market.close)
    assert not np.array_equal(one.cpi.values, two.cpi.values)
    # The shocks the apartments' modelled values use: unit normals, different per apartment.
    assert world.home_shocks.shape == (2, MAX_MONTHS)
    assert not np.array_equal(world.home_shocks[0], world.home_shocks[1])
    many = np.concatenate([make_world(noisy, i).market_shocks for i in range(20)])
    assert (many.mean(), many.std()) == pytest.approx((0.0, 1.0), abs=0.03)
