"""Bar validation: the gate every provider response passes before it reaches the cache.

Rules (a bar violating any rule is dropped and counted):

* sorted by time; duplicate timestamps -> keep the **last** occurrence (latest provider value)
* all of open/high/low/close/adj_close finite and > 0
* ``high >= max(open, close)`` and ``low <= min(open, close)`` (relative tolerance ``RTOL`` for
  provider rounding noise)
* volume finite and >= 0 (NaN volume, as Yahoo returns for some indices, becomes 0)
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.models.bars import BarFrame, ts_to_iso_dates

RTOL = 1e-6


@dataclass(frozen=True, slots=True)
class ValidationReport:
    """What validation changed. ``warnings`` is surfaced in API responses."""

    input_bars: int
    duplicates_dropped: int = 0
    invalid_dropped: int = 0
    warnings: tuple[str, ...] = field(default=())

    @property
    def ok(self) -> bool:
        return self.duplicates_dropped == 0 and self.invalid_dropped == 0


def validate_bars(frame: BarFrame, *, symbol: str = "") -> tuple[BarFrame, ValidationReport]:
    """Return a clean, sorted, de-duplicated frame and a report of what was removed."""
    n = len(frame)
    if n == 0:
        return frame, ValidationReport(input_bars=0)

    ordered = frame.take(np.argsort(frame.time, kind="stable"))
    # After a stable sort, the last of a run of equal timestamps is the latest provider value.
    is_last_of_run = np.append(ordered.time[1:] != ordered.time[:-1], True)
    deduped = ordered.take(is_last_of_run)
    duplicates = n - len(deduped)

    volume = np.where(np.isnan(deduped.volume), 0.0, deduped.volume)
    deduped = BarFrame(
        deduped.time,
        deduped.open,
        deduped.high,
        deduped.low,
        deduped.close,
        deduped.adj_close,
        volume,
    )

    prices = np.vstack([deduped.open, deduped.high, deduped.low, deduped.close, deduped.adj_close])
    prices_ok = np.all(np.isfinite(prices) & (prices > 0.0), axis=0)
    with np.errstate(invalid="ignore"):
        body_top = np.maximum(deduped.open, deduped.close)
        body_bottom = np.minimum(deduped.open, deduped.close)
        high_ok = deduped.high >= body_top * (1.0 - RTOL)
        low_ok = deduped.low <= body_bottom * (1.0 + RTOL)
    volume_ok = np.isfinite(deduped.volume) & (deduped.volume >= 0.0)
    valid = prices_ok & high_ok & low_ok & volume_ok

    clean = deduped.take(valid)
    invalid = int(np.count_nonzero(~valid))

    warnings: list[str] = []
    prefix = f"{symbol}: " if symbol else ""
    if duplicates:
        warnings.append(f"{prefix}dropped {duplicates} duplicate bar(s)")
    if invalid:
        bad_dates = ts_to_iso_dates(deduped.time[~valid])
        sample = ", ".join(bad_dates[:5]) + (" ..." if invalid > 5 else "")  # noqa: PLR2004
        warnings.append(f"{prefix}dropped {invalid} invalid bar(s): {sample}")

    report = ValidationReport(
        input_bars=n,
        duplicates_dropped=duplicates,
        invalid_dropped=invalid,
        warnings=tuple(warnings),
    )
    return clean, report
