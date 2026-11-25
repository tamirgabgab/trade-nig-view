"""VaR and ES (``app.analysis.risk``): the normal quantile, the sorted quantile, the GPD fit on
known tails, each method on a normal sample, the backtests on hand cases, and the report on
synthetic stocks (calibrated on a random walk, Cornish-Fisher broken by one shock)."""

from __future__ import annotations

import math
from statistics import NormalDist

import numpy as np
import pytest

from app.analysis import risk
from app.analysis.synthetic import Scenario, synthetic_bars
from app.models.bars import BarFrame

ND = NormalDist()


def test_normal_quantile_and_sorted_quantile() -> None:
    p = np.array([1e-6, 0.001, 0.02, 0.0243, 0.3, 0.5, 0.9, 0.975, 0.999999])
    np.testing.assert_allclose(risk.norm_ppf(p), [ND.inv_cdf(x) for x in p], atol=1e-8)
    x = np.sort(np.random.default_rng(1).standard_normal(501))
    q = np.linspace(0, 1, 37)
    np.testing.assert_allclose(risk.sorted_quantile(x, q), np.quantile(x, q), atol=1e-14)


@pytest.mark.parametrize(("xi", "draw"), [(0.0, "exponential"), (1 / 3, "pareto")])
def test_gpd_fit_recovers_the_tail_shape(xi: float, draw: str) -> None:
    rng = np.random.default_rng(3)
    u = rng.uniform(size=200_000)
    sample = -np.log(u) if draw == "exponential" else u ** (-xi) - 1  # GPD(xi, 1) itself
    fit = risk.fit_gpd(sample)
    assert fit is not None
    assert fit.xi == pytest.approx(xi, abs=0.03)
    assert fit.share == pytest.approx(0.1, abs=1e-3)


def test_every_method_on_a_normal_sample() -> None:
    x = risk.Sample.of(np.random.default_rng(2).standard_normal(100_000))
    exact = {0.95: (1.6449, 2.0627), 0.99: (2.3263, 2.6652)}
    for level, (var, es) in exact.items():
        for method in risk.METHODS:
            got = risk.var_es(x, method, level)
            assert got is not None
            assert got[0] == pytest.approx(var, abs=0.04), (method, level)
            assert got[1] == pytest.approx(es, abs=0.05), (method, level)
    # Cornish-Fisher without skew or excess kurtosis is the normal quantile.
    z = np.array([-1.0, 0.0, 2.0])
    np.testing.assert_allclose(risk.cornish_fisher(z, 0.0, 0.0), z)


def test_backtest_statistics_on_hand_cases() -> None:
    assert risk.kupiec(5, 100, 0.05) == pytest.approx(1.0)
    assert risk.kupiec(20, 100, 0.05) < 0.001
    spread = np.zeros(200, dtype=bool)
    spread[::20] = True
    clustered = np.zeros(200, dtype=bool)
    clustered[50:60] = True
    assert risk.christoffersen(clustered) < 0.001
    assert risk.christoffersen(spread) > risk.christoffersen(clustered)
    # Every breach loses exactly the ES at the right rate: Z2 = 0.
    losses = np.array([0.0] * 95 + [3.0] * 5)
    assert risk.acerbi_szekely(losses, np.full(100, 2.0), np.full(100, 3.0), 0.05) == pytest.approx(
        0
    )


def test_standardised_returns() -> None:
    frame = BarFrame.from_columns(
        time=np.arange(4) * 86_400,
        open=np.ones(4),
        high=np.ones(4),
        low=np.ones(4),
        close=np.array([100.0, 110.0, 121.0, 100.0]),
    )
    z = risk.standardised(frame, np.full(4, 0.1), 2)
    assert z[0] == pytest.approx(math.log(1.21) / (0.1 * math.sqrt(2)))
    assert np.isnan(z[2:]).all()


def test_report_on_a_random_walk_is_calibrated() -> None:
    r = risk.report(synthetic_bars(Scenario.RANDOM_WALK, 1, 3000))
    assert r is not None
    assert {e.horizon for e in r.estimates} == {"bar", "week", "month"}
    for e in r.estimates:
        assert 0 < e.var < e.es
    bar99 = [e for e in r.estimates if e.horizon == "bar" and e.level == 0.99]
    month99 = [e for e in r.estimates if e.horizon == "month" and e.level == 0.99]
    assert min(e.var for e in month99) > 3 * max(e.var for e in bar99)
    fhs = [b for b in r.backtests if b.method == "fhs"]
    assert len(fhs) == 6  # 3 levels x 2 tails
    for b in fhs:
        assert b.n == 1000
        assert b.kupiec > 0.05
        assert 0.05 < b.z2_p < 0.95
    assert set(r.breaches) == {(t, lv) for t in risk.TAILS for lv in risk.LEVELS}
    assert {t.tail for t in r.tails} == {"long", "short"}


def test_one_shock_breaks_cornish_fisher_not_the_tail_methods() -> None:
    """``shock`` has one -15 % gap: its skew and kurtosis make Cornish-Fisher's 99 % VaR absurdly
    wide (no breach at all), while FHS and EVT keep about 1 %."""
    r = risk.report(synthetic_bars(Scenario.SHOCK, 1, 3000))
    assert r is not None
    by = {(b.method, b.level, b.tail): b for b in r.backtests}
    assert by[("cornish_fisher", 0.99, "long")].breaches == 0
    assert by[("cornish_fisher", 0.99, "long")].kupiec < 0.01
    for method in ("fhs", "evt"):
        assert by[(method, 0.99, "long")].kupiec > 0.05


def test_too_short_is_none() -> None:
    assert risk.report(synthetic_bars(Scenario.RANDOM_WALK, 1, 100)) is None
