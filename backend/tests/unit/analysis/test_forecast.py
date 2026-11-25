"""Forecast models (``app.analysis.forecast``): hand vectors for the targets and features, golden
OLS and ridge, no lookahead, the vectorised quantiles against brute force, calibration on a
random walk (no edge, nominal coverage) and model C's advantage when volatility clusters."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt
import pytest

from app.analysis import forecast as fc
from app.analysis.synthetic import Scenario, synthetic_bars
from app.models.bars import BarFrame


def frame_of(o: list[float], h: list[float], lo: list[float], c: list[float]) -> BarFrame:
    n = len(c)
    return BarFrame.from_columns(
        time=np.arange(n, dtype=np.int64) * 86_400,
        open=np.array(o),
        high=np.array(h),
        low=np.array(lo),
        close=np.array(c),
        volume=np.ones(n),
    )


def clustered(n: int = 2500, seed: int = 3) -> BarFrame:
    """A walk whose volatility swings slowly (x e^{+-0.8} over 150 bars): volatility clusters."""
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    sigma = 0.012 * np.exp(0.8 * np.sin(2 * np.pi * t / 150))
    eps, eta, nu, lam = rng.standard_normal((4, n))
    c = 100 * np.exp(np.cumsum(sigma * eps))
    prev = np.concatenate(([100.0], c[:-1]))
    o = prev * np.exp(eta * sigma / 4)
    return BarFrame.from_columns(
        time=t.astype(np.int64) * 86_400,
        open=o,
        high=np.maximum(o, c) * np.exp(np.abs(nu) * sigma / 2),
        low=np.minimum(o, c) * np.exp(-np.abs(lam) * sigma / 2),
        close=c,
        volume=np.ones(n),
    )


BARS = frame_of(
    o=[10.0, 10.5, 11.0, 10.0],
    h=[11.0, 12.0, 11.5, 10.8],
    lo=[9.5, 10.0, 9.8, 9.6],
    c=[10.5, 11.5, 10.0, 10.4],
)


def test_bar_ratios_hand_vector() -> None:
    r = fc.bar_ratios(BARS)
    assert np.isnan(r[0, :2]).all()
    np.testing.assert_allclose(
        r[1], [np.log(10.5 / 10.5), np.log(11.5 / 10.5), np.log(12 / 11.5), np.log(10.5 / 10)]
    )
    np.testing.assert_allclose(r[0, 2:], [np.log(11 / 10.5), np.log(10 / 9.5)])


@pytest.mark.parametrize("h", [1, 2, 3])
def test_targets_rebuild_the_bar_h_ahead_exactly(h: int) -> None:
    y = fc.targets(BARS, h)
    n = len(BARS)
    assert np.isnan(y[n - h :]).all()
    for t in range(n - h):
        bar = fc.candles(y[t][None, :], float(BARS.close[t]))[0]
        expected = [BARS.open[t + h], BARS.high[t + h], BARS.low[t + h], BARS.close[t + h]]
        np.testing.assert_allclose(bar, expected, rtol=1e-12)


def test_features_and_their_names() -> None:
    x = fc.features(BARS, 2)
    assert x.shape == (4, 2 * 4 + 3)
    assert len(fc.feature_names(2)) == x.shape[1]
    ratios = fc.bar_ratios(BARS)
    np.testing.assert_allclose(x[2, :4], ratios[2])  # bar t
    np.testing.assert_allclose(x[2, 4:8], ratios[1])  # bar t-1
    lr = np.log(np.log(BARS.high / BARS.low))
    np.testing.assert_allclose(x[:, 8], lr)  # HAR 1
    assert np.isnan(x[:, 9][:4]).all()  # HAR 5 needs five bars


def test_ols_and_ridge_against_their_closed_forms() -> None:
    rng = np.random.default_rng(0)
    x = rng.standard_normal((200, 5))
    y = (
        x @ np.array([[0.5], [-1.0], [0.0], [2.0], [0.3]])
        + 0.7
        + 0.1 * rng.standard_normal((200, 1))
    )
    design = np.column_stack((np.ones(200), x))
    golden = np.linalg.solve(design.T @ design, design.T @ y)
    np.testing.assert_allclose(fc._ols(x, y), golden, rtol=1e-9)  # pyright: ignore[reportPrivateUsage]

    alpha = 25.0
    beta, mean, std = fc.ridge(x, y, alpha)
    xs = (x - x.mean(axis=0)) / x.std(axis=0)
    w = np.linalg.inv(xs.T @ xs + alpha * np.eye(5)) @ xs.T @ (y - y.mean())
    np.testing.assert_allclose(beta[1:], w, rtol=1e-9)
    np.testing.assert_allclose(beta[0], y.mean(axis=0), rtol=1e-12)
    np.testing.assert_allclose(mean, x.mean(axis=0))
    np.testing.assert_allclose(std, x.std(axis=0))
    # No penalty: ridge on standardised features is OLS.
    b0, m0, s0 = fc.ridge(x, y, 0.0)
    np.testing.assert_allclose(fc._predict(b0, x, m0, s0), design @ golden, rtol=1e-9)  # pyright: ignore[reportPrivateUsage]


@pytest.mark.parametrize("model", ["naive", "a", "c"])
def test_a_fit_uses_nothing_after_its_origin(model: fc.Model) -> None:
    """Fitting at origin T on the full history equals fitting on the history cut at T."""
    frame = synthetic_bars(Scenario.RANDOM_WALK, 5, 700)
    origin = 600
    params = fc.Params(window=300, ridge=10.0, lags=3)
    full = fc.fit(fc.design(frame, 3, [2]), 2, origin, model, params)
    cut = fc.fit(fc.design(frame.take(slice(0, origin + 1)), 3, [2]), 2, origin, model, params)
    assert full is not None
    assert cut is not None
    np.testing.assert_allclose(full.beta, cut.beta, rtol=1e-10, atol=1e-14)
    np.testing.assert_allclose(full.residuals, cut.residuals, rtol=1e-10, atol=1e-14)


def test_vectorised_quantiles_equal_the_scenarios() -> None:
    frame = synthetic_bars(Scenario.RANGE, 2, 800)
    d = fc.design(frame, 3, [1])
    f = fc.fit(d, 1, 700, "c", fc.Params())
    assert f is not None
    at = np.arange(700, 720)
    loc, scale = fc.location_and_scale(f, d, at)
    fast = fc.target_quantiles(f, loc, scale)
    for i in range(len(at)):
        scenarios = fc.samples(f, loc[i], float(scale[i]))
        brute = np.quantile(scenarios, fc.LEVELS, axis=0, method=fc.QUANTILE_METHOD).T
        np.testing.assert_allclose(fast[i], brute, rtol=1e-12, atol=1e-15)


def test_a_forecast_is_a_valid_candle_with_ordered_quantiles() -> None:
    frame = synthetic_bars(Scenario.UPTREND, 1, 900)
    d = fc.design(frame, 3, [1, 5])
    for h in (1, 5):
        f = fc.fit(d, h, len(frame) - 1, "c", fc.Params())
        assert f is not None
        q = fc.horizon_forecast(f, d, len(frame) - 1, h).quantiles
        assert (np.diff(q, axis=0) >= 0).all()  # each column rises with the level
        median = q[fc.LEVELS.index(0.5)]
        assert median[2] <= min(median[0], median[3]) <= max(median[0], median[3]) <= median[1]


def test_close_percentiles_are_the_scenario_closes_quantiles() -> None:
    frame = synthetic_bars(Scenario.UPTREND, 1, 900)
    d = fc.design(frame, 3, [2])
    origin = len(frame) - 1
    f = fc.fit(d, 2, origin, "c", fc.Params())
    assert f is not None
    hz = fc.horizon_forecast(f, d, origin, 2)
    loc, scale = fc.location_and_scale(f, d, np.array([origin]))
    closes = fc.candles(fc.samples(f, loc[0], float(scale[0])), float(d.close[origin]))[:, 3]
    golden = [np.sort(closes)[int(np.ceil(p * len(closes))) - 1] for p in fc.PERCENTILES]
    np.testing.assert_allclose(hz.close_percentiles, golden, rtol=1e-12)
    assert hz.close_percentiles[49] == hz.quantiles[fc.LEVELS.index(0.5), 3]  # the median


def test_pit_against_a_scalar_loop() -> None:
    """Golden: each outcome's PIT is the share of its scenarios' returns at or below it."""
    frame = synthetic_bars(Scenario.RANGE, 2, 800)
    d = fc.design(frame, 3, [1])
    origins = fc.eval_origins(len(frame), 1, 60)
    s = fc.evaluate(d, 1, "c", fc.Params(), origins, 20)
    assert s is not None
    pits: list[float] = []
    for start in range(0, len(origins), 20):
        block = origins[start : start + 20]
        f = fc.fit(d, 1, int(block[0]), "c", fc.Params())
        assert f is not None
        for t in block:
            loc, scale = fc.location_and_scale(f, d, np.array([t]))
            scenarios = fc.samples(f, loc[0], float(scale[0]))[:, 1]
            below: npt.NDArray[np.bool_] = scenarios <= d.y[1][t, 1]
            pits.append(float(below.mean()))
    counts = [0] * fc.PIT_BINS
    for u in pits:
        counts[min(int(u * fc.PIT_BINS), fc.PIT_BINS - 1)] += 1
    np.testing.assert_allclose(s.pit, [c / len(pits) for c in counts], atol=1e-12)
    assert sum(s.pit) == pytest.approx(1.0)


def test_pit_bins_put_exact_edges_in_the_upper_bin() -> None:
    u = np.array([0.0, 0.1, 0.3, 0.6, 0.7, 0.99, 1.0])
    expected = [1, 1, 0, 1, 0, 0, 1, 1, 0, 2]
    np.testing.assert_allclose(fc.pit_histogram(u), np.array(expected) / len(u))


def test_a_horizon_past_the_data_is_all_nan() -> None:
    assert np.isnan(fc.horizon_log_range(BARS, 7)).all()
    assert np.isnan(fc.targets(BARS, 7)).all()


def test_too_little_history_gives_no_fit() -> None:
    # 22 bars of HAR warm-up, then 50 training rows: below MIN_TRAIN (60).
    frame = synthetic_bars(Scenario.RANDOM_WALK, 1, 73)
    assert fc.fit(fc.design(frame, 3, [1]), 1, 72, "c", fc.Params()) is None
    longer = synthetic_bars(Scenario.RANDOM_WALK, 1, 120)
    assert fc.fit(fc.design(longer, 3, [1]), 1, 119, "c", fc.Params()) is not None


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_on_a_random_walk_coverage_is_nominal_and_there_is_no_edge(seed: int) -> None:
    """The returns are independent: the intervals hold their share (binomial tolerance, n = 500)
    and the forecast mean explains nothing out of sample."""
    frame = synthetic_bars(Scenario.RANDOM_WALK, seed, 1500)
    d = fc.design(frame, 3, [1])
    s = fc.evaluate(d, 1, "c", fc.Params(), fc.eval_origins(len(frame), 1, 500), 20)
    assert s is not None
    assert s.n == 500
    for got, nominal in zip(s.coverage, (0.5, 0.8, 0.95), strict=True):
        assert abs(got - nominal) < 3.5 * np.sqrt(nominal * (1 - nominal) / s.n)
    # No false edge; fitting noise costs a little (a negative R^2), the penalty keeps it small.
    assert -0.05 < s.r2 < 0.03
    assert abs(s.hit_rate - 0.5) < 0.08
    # Calibrated: the PIT is about flat (a tenth per bin, binomial tolerance).
    for share in s.pit:
        assert abs(share - 0.1) < 3.5 * np.sqrt(0.1 * 0.9 / s.n)


def test_model_c_beats_the_naive_benchmark_when_volatility_clusters() -> None:
    frame = clustered()
    for h in (1, 5):
        d = fc.design(frame, 3, [h])
        origins = fc.eval_origins(len(frame), h, 500)
        naive = fc.evaluate(d, h, "naive", fc.Params(window=None), origins, 20)
        c = fc.evaluate(d, h, "c", fc.Params(window=None, ridge=1000.0), origins, 20)
        assert naive is not None
        assert c is not None
        assert c.pinball < 0.95 * naive.pinball
        assert abs(c.coverage[1] - 0.8) < 0.06


def test_tuning_ranks_the_grid_by_pinball() -> None:
    frame = synthetic_bars(Scenario.RANDOM_WALK, 1, 800)
    best, tried = fc.tune(frame, "c", 200, 50)
    assert tried[0][0] == best
    assert [s for _, s in tried] == sorted(s for _, s in tried)
    assert len(tried) == len(fc.LAGS) * len(fc.WINDOWS) * len(fc.RIDGES)
    _, tried_a = fc.tune(frame, "a", 200, 50)
    assert len(tried_a) == len(fc.LAGS) * len(fc.WINDOWS)  # OLS has no penalty to tune
