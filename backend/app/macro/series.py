"""The macro series ChartLab knows, and their in-memory form.

Every series comes from the Bank of Israel's SDMX API (``dataflow/code``); several are CBS data
that the BoI republishes. A daily value is stamped with its date; a monthly value with the first day
of its month (so the CPI of 2026-10 is stored at 2026-10-01, although the CBS publishes it in the
middle of November: callers that need causality must allow for the publication lag).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.models.bars import FloatArray, IntArray


@dataclass(frozen=True, slots=True)
class SeriesSpec:
    id: str
    name: str
    unit: str
    frequency: Literal["daily", "monthly"]
    dataflow: str
    code: str


@dataclass(frozen=True, slots=True)
class MacroSeries:
    """Values by day number (days since 1970-01-01), sorted and unique."""

    days: IntArray
    values: FloatArray

    @classmethod
    def empty(cls) -> MacroSeries:
        return cls(np.empty(0, dtype=np.int64), np.empty(0, dtype=np.float64))

    def __len__(self) -> int:
        return len(self.days)


def _dwelling(district: str, name: str) -> SeriesSpec:
    suffix = f"_{district.upper()}" if district else ""
    return SeriesSpec(
        f"dwelling{'_' + district if district else ''}",
        f"Dwelling price index{' — ' + name if name else ''} (CBS, quality-adjusted)",
        "index",
        "monthly",
        "REAL_ES_DF",
        f"IND_FLT{suffix}_M",
    )


SERIES: dict[str, SeriesSpec] = {
    spec.id: spec
    for spec in (
        SeriesSpec(
            "usd_ils_boi",
            "USD/ILS official rate (Bank of Israel)",
            "ILS per USD",
            "daily",
            "EXR",
            "RER_USD_ILS",
        ),
        SeriesSpec("cpi", "Consumer price index (CBS)", "index", "monthly", "PRI", "CP"),
        _dwelling("", "Israel"),
        _dwelling("telaviv", "Tel Aviv"),
        _dwelling("center", "Center"),
        _dwelling("haifa", "Haifa"),
        _dwelling("jerusalem", "Jerusalem"),
        _dwelling("north", "North"),
        _dwelling("south", "South"),
        SeriesSpec(
            "boi_rate",
            "Bank of Israel interest rate (prime = this + 1.5)",
            "%",
            "daily",
            "BR",
            "MNT_RIB_BOI_D",
        ),
        SeriesSpec(
            "mortgage_fixed_unlinked",
            "New mortgages: average rate, fixed, not linked (from 2011-07)",
            "%",
            "monthly",
            "BIR_MRTG_99",
            "BNK_99034_LR_BIR_MRTG_467",
        ),
        SeriesSpec(
            "mortgage_fixed_cpi",
            "New mortgages: average rate, fixed, CPI-linked (from 2011-07)",
            "%",
            "monthly",
            "BIR_MRTG_99",
            "BNK_99034_LR_BIR_MRTG_1492",
        ),
    )
}
