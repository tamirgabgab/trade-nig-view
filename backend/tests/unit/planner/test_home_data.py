"""The apartment's monthly series from the macro data."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
import pytest

from app.macro.series import MacroSeries, SeriesSpec
from app.macro.service import MacroCache, MacroService
from app.planner.deposits import day_number
from app.planner.home_data import (
    assumed_anchor,
    historical_anchor,
    historical_values,
    month_days,
)
from app.planner.market import PlanError


class Source:
    id = "fake"

    def fetch(self, spec: SeriesSpec) -> MacroSeries:
        if spec.id == "boi_rate":  # 4 % from 2020-01-01, 4.5 % from 2020-03-10
            days = [day_number(date(2020, 1, 1)), day_number(date(2020, 3, 10))]
            return MacroSeries(np.array(days), np.array([4.0, 4.5]))
        days = [day_number(date(2020, m, 1)) for m in (1, 2, 3)]
        return MacroSeries(np.array(days), np.array([100.0, 110.0, 121.0]))


@pytest.fixture
def macro(tmp_path: Path) -> MacroService:
    return MacroService(MacroCache(tmp_path / "bars.db"), [Source()])


def test_month_days_are_the_purchase_day_moved_by_whole_months() -> None:
    days = month_days(date(2020, 1, 31), 2)
    assert days.tolist() == [
        day_number(d) for d in (date(2020, 1, 31), date(2020, 2, 29), date(2020, 3, 31))
    ]


def test_the_anchor_is_the_last_published_rate_and_stays_after_the_data(
    macro: MacroService,
) -> None:
    days = month_days(date(2020, 1, 15), 4)
    assert historical_anchor(macro, days).tolist() == pytest.approx(
        [0.04, 0.04, 0.045, 0.045, 0.045]
    )
    with pytest.raises(PlanError, match="starts on 2020-01-01"):
        historical_anchor(macro, month_days(date(2019, 12, 1), 2))
    assert assumed_anchor(4, 0.03).tolist() == [0.03] * 5
    assert assumed_anchor(4, 0.03, 0.02, 2).tolist() == pytest.approx(
        [0.03, 0.03, 0.05, 0.05, 0.05]
    )


def test_the_dwelling_index_is_interpolated_geometrically(macro: MacroService) -> None:
    mid = (day_number(date(2020, 1, 1)) + day_number(date(2020, 2, 1))) / 2
    days = np.array([day_number(date(2020, 1, 1)), round(mid), day_number(date(2020, 3, 20))])
    values = historical_values(macro, "dwelling", days)
    assert values[0] == pytest.approx(100.0)
    assert values[1] == pytest.approx(100 * 1.1**0.5, rel=2e-3)
    assert values[2] == pytest.approx(121.0)  # inside the last index month: its value
    with pytest.raises(PlanError, match="covers 2020-01-01 to 2020-04-01"):
        historical_values(macro, "dwelling", np.array([day_number(date(2020, 6, 1))]))
    with pytest.raises(PlanError, match="not a dwelling"):
        historical_values(macro, "cpi", days)
