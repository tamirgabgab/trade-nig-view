"""Columnar OHLCV bars.

Conventions (see docs/ARCHITECTURE.md section 6):

* ``time`` is UTC epoch seconds. For daily and longer bars it is the **session date at 00:00 UTC**
  (so ``time // 86400`` is the day number since 1970-01-01), independent of the exchange time zone.
  For intraday bars (``1h``, ``4h``) it is the real UTC instant the bar **starts**.
* ``open/high/low/close`` are **split-adjusted only** (what TradingView shows with ADJ off).
* ``adj_close`` is split **and** dividend adjusted; ``adj_close / close`` is the dividend factor.
* Arrays are sorted by ``time``, strictly increasing, all the same length.
* ``session`` (optional) is the trading session of each intraday bar as a day number
  (``app.data.sessions.session_days``); ``BarService`` sets it for intraday frames, it is ``None``
  for daily+ and synthetic frames. Session-anchored indicators (VWAP) need it.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import date
from enum import StrEnum

import numpy as np
import numpy.typing as npt

FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]

SECONDS_PER_DAY = 86_400


class Interval(StrEnum):
    """Bar intervals served by the API.

    ``1h`` and ``1D`` are downloaded (the *base* intervals); ``4h`` is resampled from ``1h`` and
    ``1W``/``1M`` from ``1D``.
    """

    H1 = "1h"
    H4 = "4h"
    D1 = "1D"
    W1 = "1W"
    M1 = "1M"

    @property
    def is_intraday(self) -> bool:
        return self in (Interval.H1, Interval.H4)

    @property
    def base(self) -> Interval:
        """The downloaded interval this one is derived from."""
        return Interval.H1 if self.is_intraday else Interval.D1


def date_to_ts(day: date) -> int:
    """Session date -> UTC epoch seconds of that date at 00:00 UTC."""
    return day.toordinal() * SECONDS_PER_DAY - date(1970, 1, 1).toordinal() * SECONDS_PER_DAY


def ts_to_date(ts: int) -> date:
    """Inverse of :func:`date_to_ts`."""
    return date.fromordinal(ts // SECONDS_PER_DAY + date(1970, 1, 1).toordinal())


def ts_to_iso_dates(times: IntArray) -> list[str]:
    """Vectorised ``YYYY-MM-DD`` strings for daily timestamps."""
    days = (times // SECONDS_PER_DAY).astype("datetime64[D]")
    return [str(day) for day in days]


_COLUMNS = ("time", "open", "high", "low", "close", "adj_close", "volume")


@dataclass(frozen=True, slots=True, eq=False)
class BarFrame:
    """Immutable column store of OHLCV bars (numpy arrays, one entry per bar)."""

    time: IntArray
    open: FloatArray
    high: FloatArray
    low: FloatArray
    close: FloatArray
    adj_close: FloatArray
    volume: FloatArray
    session: IntArray | None = None

    def __post_init__(self) -> None:
        lengths = {len(getattr(self, name)) for name in _COLUMNS}
        if self.session is not None:
            lengths.add(len(self.session))
        if len(lengths) > 1:
            raise ValueError(f"BarFrame columns have different lengths: {sorted(lengths)}")

    def __len__(self) -> int:
        return len(self.time)

    @classmethod
    def empty(cls) -> BarFrame:
        floats = np.empty(0, dtype=np.float64)
        return cls(np.empty(0, dtype=np.int64), floats, floats, floats, floats, floats, floats)

    @classmethod
    def from_columns(
        cls,
        time: Sequence[int] | IntArray,
        open: Sequence[float] | FloatArray,
        high: Sequence[float] | FloatArray,
        low: Sequence[float] | FloatArray,
        close: Sequence[float] | FloatArray,
        adj_close: Sequence[float] | FloatArray | None = None,
        volume: Sequence[float] | FloatArray | None = None,
    ) -> BarFrame:
        """Build a frame from plain sequences; ``adj_close`` defaults to ``close``, volume to 0."""
        close_arr = np.asarray(close, dtype=np.float64)
        return cls(
            time=np.asarray(time, dtype=np.int64),
            open=np.asarray(open, dtype=np.float64),
            high=np.asarray(high, dtype=np.float64),
            low=np.asarray(low, dtype=np.float64),
            close=close_arr,
            adj_close=close_arr.copy()
            if adj_close is None
            else np.asarray(adj_close, dtype=np.float64),
            volume=np.zeros_like(close_arr)
            if volume is None
            else np.asarray(volume, dtype=np.float64),
        )

    def with_session(self, session: IntArray | None) -> BarFrame:
        """The same bars with ``session`` as their session column."""
        return replace(self, session=session)

    def take(self, index: npt.NDArray[np.intp] | npt.NDArray[np.bool_] | slice) -> BarFrame:
        """Select bars by integer index array, boolean mask or slice (sessions included)."""
        return BarFrame(
            self.time[index],
            self.open[index],
            self.high[index],
            self.low[index],
            self.close[index],
            self.adj_close[index],
            self.volume[index],
            None if self.session is None else self.session[index],
        )

    @staticmethod
    def concat(frames: Sequence[BarFrame]) -> BarFrame:
        """Concatenate frames (no sorting or de-duplication; see ``validate_bars``). Sessions are
        kept only if every frame has them."""
        if not frames:
            return BarFrame.empty()
        sessions = [f.session for f in frames]
        return BarFrame(
            np.concatenate([f.time for f in frames]),
            np.concatenate([f.open for f in frames]),
            np.concatenate([f.high for f in frames]),
            np.concatenate([f.low for f in frames]),
            np.concatenate([f.close for f in frames]),
            np.concatenate([f.adj_close for f in frames]),
            np.concatenate([f.volume for f in frames]),
            None
            if any(s is None for s in sessions)
            else np.concatenate([s for s in sessions if s is not None]),
        )

    def equals(self, other: BarFrame, *, rtol: float = 0.0) -> bool:
        """Column-wise equality (exact for time, ``rtol`` for prices and volume; sessions are
        not compared)."""
        if len(self) != len(other) or not np.array_equal(self.time, other.time):
            return False
        return all(
            np.allclose(getattr(self, name), getattr(other, name), rtol=rtol, atol=0.0)
            for name in _COLUMNS[1:]
        )
