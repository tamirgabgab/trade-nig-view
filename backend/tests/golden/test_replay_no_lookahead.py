"""R7 replay guarantee for EVERY registered indicator and the gap analysis: the value at bar k
computed on the whole history equals the value computed on ``bars[:k+1]``. The chart's replay
relies on it: it shows full-history values truncated at the cursor instead of recomputing."""

from __future__ import annotations

import numpy as np
import pytest

from app.analysis.gaps import find_gaps
from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame
from tests.golden.harness import check_no_lookahead, golden_frames
from tests.golden.test_golden_bands_oscillators import HOURLY, hourly_frame

DAILY = golden_frames()["data/AAPL"]
#: Intraday bars with sessions (session-anchored indicators such as VWAP have values there).
INTRADAY = hourly_frame(next(iter(HOURLY.values())))


def cursors(frame: BarFrame) -> list[int]:
    """Replay cursors: the first bars (warm-up), spread through the history, and the last bar."""
    n = len(frame)
    return sorted({0, 1, 5, 30, n // 4, n // 2, (3 * n) // 4, n - 2, n - 1})


@pytest.mark.parametrize("frame", [DAILY, INTRADAY], ids=["1D", "1h"])
@pytest.mark.parametrize("spec_id", sorted(CATALOG))
def test_every_indicator_is_the_same_in_replay(spec_id: str, frame: BarFrame) -> None:
    spec = CATALOG[spec_id]
    check_no_lookahead(spec, frame, spec.defaults(), cursors(frame))


@pytest.mark.parametrize("partial", [False, True])
def test_gaps_in_replay_are_the_gaps_known_at_the_cursor(partial: bool) -> None:
    full = find_gaps(DAILY, 0.5, partial)
    for k in cursors(DAILY):
        replay = find_gaps(DAILY.take(slice(0, k + 1)), 0.5, partial)
        known = [g for g in full if g.index <= k]
        assert [(g.index, g.direction, g.kind, g.top, g.bottom) for g in replay] == [
            (g.index, g.direction, g.kind, g.top, g.bottom) for g in known
        ]
        # A fill after the cursor is not known yet: the chart shows that gap as open.
        filled = [
            g.filled_index if g.filled_index is not None and g.filled_index <= k else None
            for g in known
        ]
        assert [g.filled_index for g in replay] == filled
        assert np.all([g.size_pct >= 0.5 for g in replay])
