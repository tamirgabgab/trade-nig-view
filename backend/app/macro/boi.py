"""Bank of Israel SDMX API (``edge.boi.gov.il``): the only module that talks to it.

``GET .../data/dataflow/BOI.STATISTICS/<dataflow>/1.0/<code>?format=csv`` answers a CSV with, among
many metadata columns, ``TIME_PERIOD`` ('YYYY-MM-DD' or 'YYYY-MM') and ``OBS_VALUE`` (sometimes
empty).
"""

from __future__ import annotations

import csv
import io

import httpx2
import numpy as np

from app.data.providers.base import ProviderError, RateLimitedError
from app.data.ratelimit import TokenBucket
from app.macro.series import MacroSeries, SeriesSpec

BASE_URL = "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS"
HTTP_TOO_MANY_REQUESTS = 429


def period_day(period: str) -> int:
    """'YYYY-MM-DD' or 'YYYY-MM' (the first of the month) -> day number since 1970-01-01."""
    # A month ('YYYY-MM') parses as its first day.
    return int(np.datetime64(period).astype("datetime64[D]").astype(np.int64))


def parse_boi_csv(text: str) -> MacroSeries:
    """The (day, value) pairs of a BoI CSV answer, sorted, one per day (the last one wins).

    Empty and non-finite values are skipped; an unreadable period or value is a ProviderError,
    so the service serves its cached copy instead of failing.
    """
    pairs: dict[int, float] = {}
    for row in csv.DictReader(io.StringIO(text.lstrip("\ufeff"))):
        value = (row.get("OBS_VALUE") or "").strip()
        period = (row.get("TIME_PERIOD") or "").strip()
        if value and period:
            try:
                pairs[period_day(period)] = float(value)
            except ValueError as exc:
                raise ProviderError(f"Unreadable BoI row {period!r}, {value!r}") from exc
    return MacroSeries.from_pairs(pairs)


class BoiSource:
    """Downloads a whole series per request (the longest, USD/ILS, has ~13,300 rows: sparse from
    1954, daily from 1976)."""

    id = "boi"

    def __init__(
        self, *, client: httpx2.Client | None = None, bucket: TokenBucket | None = None
    ) -> None:
        self._client = client or httpx2.Client(base_url=BASE_URL, timeout=60.0)
        # No published limit: one request a second, bursts of 2.
        self._bucket = bucket or TokenBucket(rate=1.0, capacity=2)

    def fetch(self, spec: SeriesSpec) -> MacroSeries:
        self._bucket.acquire()
        try:
            response = self._client.get(
                f"/{spec.dataflow}/1.0/{spec.code}",
                params={"format": "csv", "startperiod": "1950-01-01"},
            )
        except httpx2.HTTPError as exc:
            raise ProviderError(f"Bank of Israel request for {spec.id} failed: {exc}") from exc
        if response.status_code == HTTP_TOO_MANY_REQUESTS:
            raise RateLimitedError(f"Bank of Israel rate limit for {spec.id}")
        if response.is_error:
            raise ProviderError(
                f"Bank of Israel returned HTTP {response.status_code} for {spec.id}"
            )
        series = parse_boi_csv(response.text)
        if len(series) == 0:
            raise ProviderError(f"Bank of Israel returned no values for {spec.id}")
        return series
