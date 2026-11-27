"""A parametric synthetic symbol (``app.data.synthetic_returns``, K2) as a DUT.

* every family's shocks: mean 0, variance 1, and the documented skewness and kurtosis; its
  density integrates to 1 with mean 0 and variance 1;
* golden model: a scalar loop of the layers (GARCH, AR(1), compensated jumps) on the same draws,
  ``rtol=1e-9``; with the layers off, the returns are exactly m + sqrt(q) z;
* calibration (Monte Carlo, written tolerances): the expected simple yearly return is mu and the
  yearly volatility sigma, for every layer, measured over calendar years of the bars too;
* exact mode hits the targets to 1e-12; the floor; prefix stability; valid bars.
"""

from __future__ import annotations

import math
from datetime import date

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.data.synthetic import SESSION_BARS, parametric_daily, parametric_hourly
from app.data.synthetic_returns import (
    FLOOR,
    family_density,
    family_moments,
    parametric_returns,
    standard_shocks,
    targets,
)
from app.data.validate import validate_bars
from app.models.synthetic import YEAR_BARS, ParametricDefinition, ReturnShape

FAMILIES = ["normal", "student_t", "uniform", "laplace", "skew_normal"]


def shape(**changes: object) -> ReturnShape:
    return ReturnShape.model_validate(changes)


def definition(**changes: object) -> ParametricDefinition:
    base: dict[str, object] = {
        "name": "PAR",
        "full_name": "Parametric",
        "seed": 1,
        "first_date": date(2000, 1, 3),
        "bars": 600,
    }
    return ParametricDefinition.model_validate({**base, **changes})


@pytest.mark.parametrize(
    "family", [*FAMILIES, "skew_normal_right"], ids=[*FAMILIES, "skew_normal_right"]
)
def test_the_shocks_have_the_family_moments(family: str) -> None:
    changes: dict[str, object] = {"distribution": family, "df": 30.0}
    if family == "skew_normal_right":
        changes = {"distribution": "skew_normal", "skew": 6.0}
    s = shape(**changes)
    z = standard_shocks(s, 400_000, 7)
    skew, kurt = family_moments(s)
    assert z.mean() == pytest.approx(0, abs=0.01)
    assert z.var() == pytest.approx(1, rel=0.01)
    assert np.mean(z**3) == pytest.approx(skew, abs=0.03)
    assert kurt is not None
    assert np.mean(z**4) - 3 == pytest.approx(kurt, abs=0.12)


def test_a_heavy_t_keeps_its_variance_and_has_no_finite_kurtosis() -> None:
    s = shape(distribution="student_t", df=5.0)
    assert standard_shocks(s, 400_000, 3).var() == pytest.approx(1, rel=0.05)
    assert family_moments(s) == (0.0, 6.0)
    assert family_moments(shape(distribution="student_t", df=3.0))[1] is None


@pytest.mark.parametrize("family", FAMILIES)
def test_the_density_is_standardised(family: str) -> None:
    s = shape(distribution=family, df=5.0, skew=-4.0)
    z = np.linspace(-40, 40, 800_001)
    f = family_density(s, z)
    dz = z[1] - z[0]
    assert float(np.sum(f) * dz) == pytest.approx(1, abs=2e-3)
    assert float(np.sum(z * f) * dz) == pytest.approx(0, abs=2e-3)
    assert float(np.sum(z**2 * f) * dz) == pytest.approx(1, abs=1e-2)


def golden_returns(s: ReturnShape, n: int, seed: int) -> np.ndarray:
    """The layers by a scalar loop of the documented recursions, on the module's own draws."""
    t = targets(s)
    z = standard_shocks(s, n, seed)
    counts = np.random.default_rng([seed, 2]).poisson(t.jump_rate, n)
    sizes = np.random.default_rng([seed, 3]).standard_normal(n)
    mu_j, sd_j = s.jump_mean_pct / 100, s.jump_sd_pct / 100
    out = np.empty(n)
    h, d = t.q, 0.0
    for i in range(n):
        e = math.sqrt(h) * float(z[i])
        d = e / math.sqrt(1 - s.memory**2) if i == 0 else s.memory * d + e
        jump = counts[i] * mu_j + math.sqrt(counts[i]) * sd_j * float(sizes[i]) - t.jump_rate * mu_j
        out[i] = t.m + d + jump
        h = t.q * (1 - s.garch_alpha - s.garch_beta) + s.garch_alpha * e * e + s.garch_beta * h
    if s.exact:
        out = t.m + (out - out.mean()) * (t.s / out.std())
    return np.maximum(out, FLOOR)


LAYERS = [
    {},
    {"distribution": "student_t", "df": 4.0},
    {"garch_alpha": 0.08, "garch_beta": 0.9},
    {"memory": 0.3},
    {"memory": -0.4},
    {"jumps_per_year": 4.0, "jump_mean_pct": -6.0, "jump_sd_pct": 4.0},
    {
        "distribution": "skew_normal",
        "memory": 0.2,
        "garch_alpha": 0.05,
        "garch_beta": 0.9,
        "jumps_per_year": 2.0,
    },
    {"distribution": "laplace", "exact": True, "jumps_per_year": 3.0},
]


@pytest.mark.parametrize("changes", LAYERS)
def test_the_returns_match_the_golden_model(changes: dict[str, object]) -> None:
    s = shape(**changes)
    np.testing.assert_allclose(
        parametric_returns(s, 3000, 11).returns, golden_returns(s, 3000, 11), rtol=1e-9, atol=1e-15
    )


@pytest.mark.parametrize("family", FAMILIES)
def test_without_layers_the_returns_are_the_scaled_shocks(family: str) -> None:
    s = shape(distribution=family)
    t = targets(s)
    expected = t.m + math.sqrt(t.q) * standard_shocks(s, 2000, 5)
    np.testing.assert_array_equal(parametric_returns(s, 2000, 5).returns, expected)
    assert t.q == pytest.approx((0.18**2) / round(YEAR_BARS))


def yearly(s: ReturnShape, years: int, paths: int) -> tuple[np.ndarray, np.ndarray]:
    """Simple yearly returns and summed-return yearly variances, over many paths."""
    n = round(YEAR_BARS)
    gross: list[np.ndarray] = []
    sums: list[np.ndarray] = []
    for seed in range(paths):
        r = parametric_returns(s, n * years, seed).returns.reshape(years, n)
        gross.append(np.prod(1 + r, axis=1) - 1)
        sums.append(r.sum(axis=1))
    return np.concatenate(gross), np.concatenate(sums)


@pytest.mark.parametrize("changes", LAYERS[:-1])
def test_mu_and_sigma_hold_over_a_year(changes: dict[str, object]) -> None:
    # 2,000 years each; the mean's Monte Carlo error is about sigma / sqrt(2000) = 0.4 %.
    s = shape(**changes)
    gross, sums = yearly(s, 20, 100)
    assert gross.mean() == pytest.approx(0.07, abs=0.016)
    assert sums.std() == pytest.approx(0.18, rel=0.06)


def test_mu_holds_over_calendar_years_of_the_bars() -> None:
    # The app's own clock: closes one calendar year apart (each year's first bar), many paths.
    years: list[float] = []
    for seed in range(60):
        daily = parametric_daily(definition(seed=seed, bars=5300, first_date=date(2000, 1, 3)))
        day = (daily.time // 86_400).astype("datetime64[D]")
        year = day.astype("datetime64[Y]")
        firsts = np.flatnonzero(np.r_[True, year[1:] != year[:-1]])
        closes = daily.close[firsts]
        years.extend((closes[1:] / closes[:-1] - 1).tolist())
    assert np.mean(years) == pytest.approx(0.07, abs=0.015)


@pytest.mark.parametrize("changes", [{}, *LAYERS])
def test_exact_mode_hits_the_targets_in_the_path(changes: dict[str, object]) -> None:
    s = shape(**{**changes, "exact": True})
    t = targets(s)
    path = parametric_returns(s, 2610, 9)
    assert path.floored == 0
    assert path.returns.mean() == pytest.approx(t.m, rel=1e-12, abs=1e-15)
    assert path.returns.std() == pytest.approx(t.s, rel=1e-12)


def test_exact_with_a_heavy_t_and_jumps() -> None:
    s = shape(distribution="student_t", df=2.5, exact=True, jumps_per_year=5.0, jump_sd_pct=3.0)
    path = parametric_returns(s, 5000, 4)
    assert path.floored == 0
    assert path.returns.std() == pytest.approx(targets(s).s, rel=1e-12)


def test_the_floor_catches_a_fall_of_more_than_99_percent() -> None:
    s = shape(
        vol_pct=100.0,
        distribution="student_t",
        df=2.1,
        jumps_per_year=10.0,
        jump_mean_pct=-20.0,
        jump_sd_pct=10.0,
    )
    path = parametric_returns(s, 10_000, 1)
    assert path.returns.min() >= FLOOR
    assert path.floored == int(np.count_nonzero(path.returns == FLOOR))


@settings(max_examples=25, deadline=None)
@given(
    family=st.sampled_from(FAMILIES),
    seed=st.integers(0, 1_000_000),
    short=st.integers(100, 800),
    extra=st.integers(1, 800),
    garch=st.booleans(),
    jumps=st.booleans(),
    memory=st.sampled_from([0.0, 0.3, -0.3]),
)
def test_a_longer_path_starts_with_the_shorter_one(
    family: str, seed: int, short: int, extra: int, garch: bool, jumps: bool, memory: float
) -> None:
    s = shape(
        distribution=family,
        garch_alpha=0.1 if garch else 0.0,
        garch_beta=0.85 if garch else 0.0,
        jumps_per_year=3.0 if jumps else 0.0,
        memory=memory,
    )
    a = parametric_returns(s, short, seed).returns
    b = parametric_returns(s, short + extra, seed).returns
    np.testing.assert_array_equal(b[:short], a)


@settings(max_examples=20, deadline=None)
@given(
    family=st.sampled_from(FAMILIES),
    seed=st.integers(0, 1_000_000),
    exact=st.booleans(),
    first_price=st.floats(0.01, 1_000_000),
)
def test_bars_are_valid_and_aggregate_their_hours(
    family: str, seed: int, exact: bool, first_price: float
) -> None:
    d = definition(
        distribution=family,
        seed=seed,
        exact=exact,
        first_price=first_price,
        garch_alpha=0.05,
        garch_beta=0.9,
        jumps_per_year=2.0,
    )
    hours, daily = parametric_hourly(d), parametric_daily(d)
    for frame in (hours, daily):
        clean, report = validate_bars(frame)
        assert report.ok
        assert clean.equals(frame)
        assert (frame.volume > 0).all()
    assert len(daily) == d.bars
    assert daily.close[0] == pytest.approx(first_price, rel=1e-12)
    shape_ = (d.bars, SESSION_BARS)
    np.testing.assert_array_equal(daily.close, hours.close.reshape(shape_)[:, -1])
    np.testing.assert_array_equal(daily.high, hours.high.reshape(shape_).max(axis=1))
    assert parametric_hourly(d).equals(hours)


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"garch_alpha": 0.2, "garch_beta": 0.8}, "below 1"),
        ({"jumps_per_year": 20.0, "jump_sd_pct": 10.0}, "jumps carry"),
        ({"df": 2.0}, "greater than 2"),
        ({"distribution": "cauchy"}, "distribution"),
        ({"memory": 0.95}, "less than or equal"),
    ],
)
def test_inconsistent_statistics_are_refused(changes: dict[str, object], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        shape(**changes)


def test_the_learn_pages_worked_example() -> None:
    # docs/indicators/synthetic-symbols.md, the parametric symbol with the defaults.
    n = round(YEAR_BARS)
    assert (round(YEAR_BARS, 2), n) == (260.89, 261)
    t = targets(shape())
    assert round(t.m * 100, 4) == 0.0259
    assert round(math.sqrt(t.q) * 100, 3) == 1.114
    day = t.m - 2 * math.sqrt(t.q)
    assert (round(day * 100, 2), round(100 * (1 + day), 2)) == (-2.20, 97.80)
    assert round(math.sqrt(3 / 5), 3) == 0.775
    assert family_moments(shape(distribution="student_t", df=5.0)) == (0.0, 6.0)
    memory = targets(shape(memory=0.3))
    k = n + 2 * sum((n - j) * 0.3**j for j in range(1, n))
    assert round(k, 1) == 483.5
    assert round(math.sqrt(memory.gamma0) * 100, 3) == 0.819
    assert round(memory.m * 100, 4) == 0.0231
    jumps = targets(shape(jumps_per_year=4.0, jump_mean_pct=-6.0, jump_sd_pct=4.0))
    assert round(jumps.gamma0 * n, 4) == 0.0116
    assert round(math.sqrt(jumps.gamma0 * n) * 100, 1) == 10.8
    assert round(math.sqrt(jumps.gamma0) * 100, 3) == 0.667
    assert round(jumps.jump_rate * 6, 3) == 0.092
