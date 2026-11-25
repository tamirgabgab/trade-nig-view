"""Property tests for the volatility set (V1): no lookahead, non-negative, scale and time-shift
invariant, rank in [0, 100], on generated positive OHLC bars."""

from __future__ import annotations

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from app.indicators import hv
from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame
from tests.golden.harness import check_no_lookahead

ESTIMATORS = sorted(hv.ESTIMATORS)


@st.composite
def bars(draw: st.DrawFn, min_size: int = 3, max_size: int = 120) -> BarFrame:
    """Positive bars from log moves: gaps, bodies and wicks (zero ones likely), irregular times."""
    n = draw(st.integers(min_size, max_size))
    move = st.sampled_from([0.0, 0.0, 0.01, -0.02, 0.05, -0.1])
    gap, body = (
        draw(arrays(np.float64, n, elements=move)),
        draw(arrays(np.float64, n, elements=move)),
    )
    up = draw(arrays(np.float64, n, elements=st.sampled_from([0.0, 0.01, 0.03])))
    down = draw(arrays(np.float64, n, elements=st.sampled_from([0.0, 0.02, 0.04])))
    steps = draw(arrays(np.int64, n, elements=st.sampled_from([3600, 86_400, 3 * 86_400])))
    close = np.empty(n)
    opens = np.empty(n)
    prev = 100.0
    for i in range(n):
        opens[i] = prev * np.exp(gap[i])
        close[i] = opens[i] * np.exp(body[i])
        prev = close[i]
    return BarFrame.from_columns(
        time=np.cumsum(steps),
        open=opens,
        high=np.maximum(opens, close) * np.exp(up),
        low=np.minimum(opens, close) * np.exp(-down),
        close=close,
    )


def _ks(data: st.DataObject, frame: BarFrame) -> list[int]:
    return data.draw(st.lists(st.integers(0, len(frame) - 1), min_size=1, max_size=4, unique=True))


@settings(max_examples=60, deadline=None)
@given(data=st.data(), frame=bars(), estimator=st.sampled_from(ESTIMATORS), n=st.integers(2, 10))
def test_no_lookahead(data: st.DataObject, frame: BarFrame, estimator: str, n: int) -> None:
    ks = _ks(data, frame)
    check_no_lookahead(CATALOG["hv"], frame, {"estimator": estimator, "length": n}, ks)
    params = {"estimator": estimator, "length": n, "lookback": 5}
    check_no_lookahead(CATALOG["hv_percentile"], frame, params, ks)


@settings(max_examples=60, deadline=None)
@given(frame=bars(), estimator=st.sampled_from(ESTIMATORS), n=st.integers(2, 10))
def test_non_negative_and_price_scale_invariant(frame: BarFrame, estimator: str, n: int) -> None:
    v = hv.rolling_variance(frame, estimator, n)
    ok = np.isfinite(v)
    assert (v[ok] >= -1e-15).all()
    scaled = BarFrame.from_columns(
        time=frame.time,
        open=frame.open * 37.5,
        high=frame.high * 37.5,
        low=frame.low * 37.5,
        close=frame.close * 37.5,
    )
    np.testing.assert_allclose(
        hv.rolling_variance(scaled, estimator, n), v, rtol=1e-9, atol=1e-15, equal_nan=True
    )


@settings(max_examples=60, deadline=None)
@given(frame=bars(min_size=12), estimator=st.sampled_from(ESTIMATORS))
def test_rank_is_a_percentage(frame: BarFrame, estimator: str) -> None:
    rank = CATALOG["hv_percentile"].run(frame, {"estimator": estimator, "length": 2, "lookback": 4})
    values = rank["rank"][np.isfinite(rank["rank"])]
    assert ((values >= 0) & (values <= 100)).all()
    assert set(np.round(values, 9)) <= {0.0, 25.0, 50.0, 75.0, 100.0}


@settings(max_examples=60, deadline=None)
@given(frame=bars(), shift=st.integers(-(10**8), 10**8))
def test_bars_per_year_depends_on_the_spacing_only(frame: BarFrame, shift: int) -> None:
    per_year = hv.bars_per_year(frame.time)
    np.testing.assert_allclose(hv.bars_per_year(frame.time + shift), per_year, equal_nan=True)
    assert (per_year[1:] > 0).all()


@settings(max_examples=40, deadline=None)
@given(data=st.data(), frame=bars(min_size=60), level=st.sampled_from(["90", "95", "99"]))
def test_var_bands_no_lookahead_and_ordered(
    data: st.DataObject, frame: BarFrame, level: str
) -> None:
    params = {"level": level, "window": 50, "length": 3}
    check_no_lookahead(CATALOG["var_bands"], frame, params, _ks(data, frame))
    out = CATALOG["var_bands"].run(frame, params)
    ok = np.isfinite(out["upper"])
    assert (out["lower"][ok] <= out["upper"][ok]).all()


@settings(max_examples=30, deadline=None)
@given(data=st.data(), frame=bars(min_size=70))
def test_regime_indicators_have_no_lookahead(data: st.DataObject, frame: BarFrame) -> None:
    ks = _ks(data, frame)
    for indicator in ("variance_ratio", "regime"):
        check_no_lookahead(CATALOG[indicator], frame, {"length": 64}, ks)
    check_no_lookahead(CATALOG["hurst_dfa"], frame, {"length": 64}, ks)
    labels = CATALOG["regime"].run(frame, {"length": 64})["regime"]
    assert set(labels[np.isfinite(labels)].tolist()) <= {-1.0, 0.0, 1.0}
