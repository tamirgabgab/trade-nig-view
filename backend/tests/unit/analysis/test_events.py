"""Event study: hand vectors with exact statistics, episode skipping, edge cases (no events,
one event, too few bars, a flat series) and histogram fractions."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.analysis.events import HISTOGRAM_BINS, _episodes, event_study  # pyright: ignore[reportPrivateUsage]
from app.models.bars import FloatArray

#: log closes 0, 0.1, 0, 0.3, 0.2, 0.2 -> 1-bar forward returns 0.1, -0.1, 0.3, -0.1, 0.0
CLOSE: FloatArray = np.exp(np.array([0.0, 0.1, 0.0, 0.3, 0.2, 0.2]))
SIGNAL = np.array([True, False, True, True, False, True])  # bar 5 has no forward return


def test_hand_vector_without_episodes() -> None:
    s = event_study(CLOSE, SIGNAL, horizon=1, episodes=False)
    assert s.event_index.tolist() == [0, 2, 3]
    ev, base = s.events, s.baseline
    assert ev.n == 3
    assert ev.mean == pytest.approx(0.1)
    assert ev.median == pytest.approx(0.1)
    assert ev.std == pytest.approx(0.2)
    assert ev.hit_rate == pytest.approx(2 / 3)
    assert base.n == 5
    assert base.mean == pytest.approx(0.04)
    assert base.median == pytest.approx(0.0, abs=1e-15)
    assert base.std == pytest.approx(math.sqrt(0.028))
    assert base.hit_rate == pytest.approx(0.4)  # 0.0 is not a hit
    se = 0.2 / math.sqrt(3)
    assert s.edge == pytest.approx(0.06)
    assert s.se == pytest.approx(se)
    assert s.t_stat == pytest.approx(0.06 / se)
    assert s.ci95 == pytest.approx((0.06 - 1.96 * se, 0.06 + 1.96 * se))


def test_hand_vector_with_episodes() -> None:
    s = event_study(CLOSE, SIGNAL, horizon=1)
    assert s.event_index.tolist() == [0, 2]  # bar 3 is 1 bar after the event at bar 2
    assert s.events.mean == pytest.approx(0.2)
    assert s.events.std == pytest.approx(math.sqrt(0.02))


def test_horizon_two_returns() -> None:
    s = event_study(CLOSE, SIGNAL, horizon=2, episodes=False)
    # r_t = x[t+2] - x[t]: 0.0, 0.2, 0.2, -0.1 for t = 0..3; bars 4, 5 have none
    assert s.baseline.n == 4
    assert s.baseline.mean == pytest.approx(0.075)
    assert s.event_index.tolist() == [0, 2, 3]
    assert s.events.mean == pytest.approx(0.1 / 3)
    assert s.events.hit_rate == pytest.approx(1 / 3)


def test_episodes_skip_signals_within_the_horizon() -> None:
    candidates = np.array([0, 1, 2, 3, 4, 7, 8, 12], dtype=np.int64)
    assert _episodes(candidates, 3).tolist() == [0, 4, 8, 12]
    assert _episodes(candidates, 0).tolist() == candidates.tolist()
    assert _episodes(np.empty(0, dtype=np.int64), 5).tolist() == []


def test_no_events_and_one_event_give_undefined_numbers() -> None:
    none = event_study(CLOSE, np.zeros(6, dtype=np.bool_), horizon=1)
    assert none.events.n == 0
    assert all(math.isnan(v) for v in (none.events.mean, none.edge, none.se, none.t_stat))
    assert none.events_hist.sum() == 0
    one = event_study(CLOSE, np.array([False, True, False, False, False, False]), horizon=1)
    assert one.events.n == 1
    assert one.events.mean == pytest.approx(-0.1)
    assert math.isnan(one.events.std)
    assert math.isnan(one.se)
    assert all(math.isnan(v) for v in one.ci95)


def test_fewer_bars_than_the_horizon() -> None:
    s = event_study(CLOSE[:3], np.ones(3, dtype=np.bool_), horizon=5)
    assert (s.events.n, s.baseline.n) == (0, 0)
    assert len(s.edges) == len(s.events_hist) == 0
    assert len(s.event_index) == 0


def test_histogram_fractions() -> None:
    rng = np.random.default_rng(3)
    close = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, 800)))
    signal = rng.random(800) < 0.1
    s = event_study(close, signal, horizon=5)
    assert len(s.edges) == HISTOGRAM_BINS + 1
    assert len(s.events_hist) == len(s.baseline_hist) == HISTOGRAM_BINS
    assert (np.diff(s.edges) > 0).all()
    assert s.events_hist.sum() == pytest.approx(1.0)
    assert s.baseline_hist.sum() == pytest.approx(1.0)
    r = np.log(close[5:] / close[:-5])
    assert s.edges[0] == pytest.approx(np.percentile(r, 1))
    assert s.edges[-1] == pytest.approx(np.percentile(r, 99))
    # the tails beyond the 1st/99th percentile land in the outer bins
    assert s.baseline_hist[0] >= np.mean(r <= s.edges[0])


def test_flat_series_still_has_bins() -> None:
    s = event_study(np.full(20, 50.0), np.ones(20, dtype=np.bool_), horizon=2)
    assert s.baseline.mean == 0.0
    assert s.baseline.hit_rate == 0.0
    assert (np.diff(s.edges) > 0).all()
    assert s.baseline_hist.sum() == pytest.approx(1.0)
    assert math.isnan(s.t_stat)  # se = 0
