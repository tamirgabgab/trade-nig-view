"""Tiingo end-of-day prices (free tier: 50 requests/hour, 1,000/day; stocks and ETFs only).

Tiingo returns **raw** OHLC (not split-adjusted) plus ``splitFactor`` per day and fully adjusted
``adjClose``. To match the ChartLab convention we split-adjust OHLC ourselves: with split factors
:math:`s_k` (``s_k = 4`` on the day of a 4:1 split), the cumulative factor of bar :math:`t` is

.. math:: F_t = \\prod_{k > t} s_k

and the split-adjusted values are :math:`P_t / F_t` for prices and :math:`V_t F_t` for volume.
Only splits inside the fetched window are known; the cache detects later splits by comparing the
overlap of a refresh with cached bars and re-downloads the full history when they disagree.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx2
import numpy as np

from app.data.providers.base import ProviderError, RateLimitedError
from app.data.ratelimit import TokenBucket
from app.models.bars import SECONDS_PER_DAY, BarFrame
from app.models.symbols import SymbolInfo

BASE_URL = "https://api.tiingo.com"
HTTP_TOO_MANY_REQUESTS = 429
HTTP_UNAUTHORIZED = 401
HTTP_FORBIDDEN = 403
HTTP_NOT_FOUND = 404


def frame_from_prices(rows: list[dict[str, Any]]) -> BarFrame:
    """Convert Tiingo ``/tiingo/daily/<ticker>/prices`` JSON rows to a split-adjusted frame."""
    if not rows:
        return BarFrame.empty()
    days = np.array([row["date"][:10] for row in rows], dtype="datetime64[D]").astype(np.int64)

    def column(name: str) -> np.ndarray[Any, np.dtype[np.float64]]:
        return np.array([float(row[name]) for row in rows], dtype=np.float64)

    split = np.array([float(row.get("splitFactor", 1.0) or 1.0) for row in rows])
    # F_t = product of split factors strictly after t (reverse cumulative product, shifted by one).
    after = np.concatenate((np.cumprod(split[::-1])[::-1][1:], [1.0]))
    return BarFrame(
        time=days * SECONDS_PER_DAY,
        open=column("open") / after,
        high=column("high") / after,
        low=column("low") / after,
        close=column("close") / after,
        adj_close=column("adjClose"),
        volume=column("volume") * after,
    )


class TiingoProvider:
    """Key-based fallback for stocks and ETFs."""

    id = "tiingo"

    def __init__(
        self,
        api_key: str,
        *,
        client: httpx2.Client | None = None,
        bucket: TokenBucket | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("TiingoProvider needs an API key (TIINGO_API_KEY in .env)")
        self._client = client or httpx2.Client(base_url=BASE_URL, timeout=20.0)
        self._headers = {"Authorization": f"Token {api_key}", "Accept": "application/json"}
        # 50 requests/hour on the free tier.
        self._bucket = bucket or TokenBucket(rate=50 / 3600, capacity=10)

    def supports(self, symbol: SymbolInfo) -> bool:
        return symbol.type in {"stock", "etf"}

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        self._bucket.acquire()
        ticker = symbol.symbol.replace(".", "-").lower()
        try:
            response = self._client.get(
                f"/tiingo/daily/{ticker}/prices",
                params={"startDate": start.isoformat(), "endDate": end.isoformat()},
                headers=self._headers,
            )
        except httpx2.HTTPError as exc:
            raise ProviderError(f"Tiingo request for {symbol.symbol} failed: {exc}") from exc
        if response.status_code == HTTP_TOO_MANY_REQUESTS:
            raise RateLimitedError(f"Tiingo rate limit for {symbol.symbol}")
        if response.status_code in {HTTP_UNAUTHORIZED, HTTP_FORBIDDEN}:
            raise ProviderError("Tiingo rejected the API key (check TIINGO_API_KEY in .env)")
        if response.status_code == HTTP_NOT_FOUND:
            raise ProviderError(f"Tiingo does not know {symbol.symbol}")
        if response.is_error:
            raise ProviderError(f"Tiingo returned HTTP {response.status_code}")
        payload: Any = response.json()
        if not isinstance(payload, list):
            raise ProviderError(f"Unexpected Tiingo response for {symbol.symbol}")
        return frame_from_prices(payload)  # pyright: ignore[reportUnknownArgumentType]
