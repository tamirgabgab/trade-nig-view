"""Historical Volatility and its percentile: hand vectors per estimator, the bars-per-year count,
Pine's percent rank, warm-up and validation."""

from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np
import pytest

from app.indicators import hv
from app.indicators.catalog import CATALOG
from app.indicators.hv_percentile import percent_rank
from app.indicators.registry import InvalidParamsError
from app.models.bars import BarFrame, date_to_ts
from tests.unit.indicators.test_composites import arr

NAN = np.nan
HV = CATALOG["hv"]
RANK = CATALOG["hv_percentile"]
DAY = 86_400


def flat_bars(n: int, half_range: float = 0.05) -> BarFrame:
    """O = C = 100 (no gap, no body), H / L = 100 e^{+-half_range}: ln(H/L) = 2 half_range."""
    c = np.full(n, 100.0)
    return BarFrame.from_columns(
        time=np.arange(n) * DAY,
        open=c,
        high=c * math.exp(half_range),
        low=c * math.exp(-half_range),
        close=c,
    )


@pytest.mark.parametrize(
    ("estimator", "variance"),
    [
        ("parkinson", 0.01 / (4 * math.log(2))),
        ("garman_klass", 0.5 * 0.01),  # no body
        ("rogers_satchell", 2 * 0.05**2),  # ln(H/C) ln(H/O) + ln(L/C) ln(L/O)
        ("close", 0.0),  # no return at all
        ("yang_zhang", (1 - 0.34 / (1.34 + 3)) * 2 * 0.05**2),  # n = 2: k = 0.34 / 4.34
    ],
)
def test_hand_vectors_on_flat_bars(estimator: str, variance: float) -> None:
    frame = flat_bars(4)
    out = hv.rolling_variance(frame, estimator, 2)
    warm = hv.warmup(estimator, 2)
    assert np.isnan(out[:warm]).all()
    np.testing.assert_allclose(out[warm:], variance, rtol=1e-12, atol=1e-15)


def test_close_and_yang_zhang_on_alternating_bars() -> None:
    # Closes 100, 110, 100, 110 opening at the previous close: no gap, the body is the whole move
    # (+-g), and RS = 0 (each bar opens at one extreme and closes at the other).
    c = arr(100, 110, 100, 110)
    o = np.concatenate(([100.0], c[:-1]))
    frame = BarFrame.from_columns(
        time=np.arange(4) * DAY, open=o, high=np.maximum(o, c), low=np.minimum(o, c), close=c
    )
    g = math.log(1.1)
    close = hv.rolling_variance(frame, "close", 2)
    np.testing.assert_allclose(close[2:], g * g, rtol=1e-12)  # population var of (+g, -g)
    yz = hv.rolling_variance(frame, "yang_zhang", 2)
    k = 0.34 / 4.34
    np.testing.assert_allclose(yz[2:], k * 2 * g * g, rtol=1e-12)  # k x sample var of the bodies
    gapped = BarFrame.from_columns(time=frame.time, open=c, high=c, low=c, close=c)
    # Now every move is a gap (O = C = H = L): s_o^2 = 2 g^2 and nothing else.
    np.testing.assert_allclose(hv.rolling_variance(gapped, "yang_zhang", 2)[2:], 2 * g * g)
    np.testing.assert_allclose(hv.rolling_variance(gapped, "parkinson", 2)[1:], 0.0)


def test_annualised_values_scale_with_the_bars_per_year() -> None:
    frame = flat_bars(30)
    per_bar = HV.run(frame, {"estimator": "parkinson", "length": 5, "annualize": False})["hv"]
    yearly = HV.run(frame, {"estimator": "parkinson", "length": 5})["hv"]
    np.testing.assert_allclose(per_bar[4:], 100 * math.sqrt(0.01 / (4 * math.log(2))))
    # Consecutive calendar days, under a year: the rate so far is 365.25 bars a year.
    np.testing.assert_allclose(yearly[4:], per_bar[4:] * math.sqrt(365.25), rtol=1e-12)


def business_days(start: date, count: int) -> np.ndarray:
    days: list[int] = []
    day = start
    while len(days) < count:
        if day.weekday() < 5:
            days.append(date_to_ts(day))
        day += timedelta(days=1)
    return np.array(days, dtype=np.float64)


def test_bars_per_year_counts_the_trading_time() -> None:
    daily = hv.bars_per_year(business_days(date(2020, 1, 1), 800))
    assert np.isnan(daily[0])
    assert 260 <= daily[-1] <= 262  # 52 weeks x 5 days (no holidays here)
    weekly = hv.bars_per_year(np.arange(200) * 7.0 * DAY)
    assert weekly[-1] == 53  # (t - 365.25 d, t] holds 53 weekly opens
    hourly = np.array(
        [d + 3600 * h for d in business_days(date(2020, 1, 1), 300) for h in range(7)]
    )
    assert 1820 <= hv.bars_per_year(hourly)[-1] <= 1834  # 7 bars x ~261 days


def test_percent_rank_is_pines() -> None:
    np.testing.assert_allclose(
        percent_rank(arr(1, 2, 3, 2, NAN, 5, 6), 2),
        arr(NAN, NAN, 100, 50, NAN, NAN, NAN),
        equal_nan=True,
    )
    assert np.isnan(percent_rank(arr(1, 2), 2)).all()


def test_percentile_of_a_rising_volatility_is_100() -> None:
    frame = BarFrame.from_columns(
        time=np.arange(40) * DAY,
        open=np.full(40, 100.0),
        high=100 * np.exp(np.linspace(0.01, 0.2, 40)),
        low=np.full(40, 100.0),
        close=np.full(40, 100.0),
    )
    out = RANK.run(frame, {"estimator": "parkinson", "length": 2, "lookback": 5})["rank"]
    warm = RANK.warmup(RANK.defaults() | {"estimator": "parkinson", "length": 2, "lookback": 5})
    assert warm == 6
    assert np.isnan(out[:warm]).all()
    np.testing.assert_allclose(out[warm:], 100.0)


def test_defaults_and_validation() -> None:
    assert HV.defaults() == {"estimator": "yang_zhang", "length": 21, "annualize": True}
    assert HV.warmup(HV.defaults()) == 21
    assert HV.warmup({"estimator": "parkinson", "length": 21, "annualize": True}) == 20
    assert HV.total_lookback(HV.defaults()) == 300 + 21
    assert RANK.defaults() == {"estimator": "yang_zhang", "length": 21, "lookback": 252}
    assert RANK.levels == (10.0, 90.0)
    with pytest.raises(InvalidParamsError, match="length"):
        HV.run(flat_bars(5), {"length": 1})
    with pytest.raises(ValueError, match="unknown estimator"):
        hv.rolling_variance(flat_bars(5), "range", 2)
    with pytest.raises(ValueError, match=">= 2"):
        hv.rolling_variance(flat_bars(5), "close", 1)
