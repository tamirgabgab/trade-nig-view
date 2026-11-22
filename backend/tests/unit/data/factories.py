"""Helpers to build small, readable bar frames in tests."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from app.models.bars import BarFrame, date_to_ts


def bars(
    days: Sequence[date],
    closes: Sequence[float],
    *,
    adj: Sequence[float] | None = None,
    volume: Sequence[float] | None = None,
) -> BarFrame:
    """Bars with O = C - 0.5, H = C + 1, L = C - 1 (always a valid candle)."""
    return BarFrame.from_columns(
        time=[date_to_ts(d) for d in days],
        open=[c - 0.5 for c in closes],
        high=[c + 1.0 for c in closes],
        low=[c - 1.0 for c in closes],
        close=closes,
        adj_close=adj,
        volume=volume if volume is not None else [100.0] * len(closes),
    )
