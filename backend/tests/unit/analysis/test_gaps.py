"""Gaps: hand vectors for full and partial gaps, the size filter, fills and fill prices."""

from __future__ import annotations

import pytest

from app.analysis.gaps import Gap, find_gaps
from app.models.bars import BarFrame


def bars(rows: list[tuple[float, float, float, float]]) -> BarFrame:
    o, h, lo, c = (list(col) for col in zip(*rows, strict=True))
    return BarFrame.from_columns(
        time=[86_400 * i for i in range(len(rows))], open=o, high=h, low=lo, close=c
    )


def test_full_gap_up_filled_later() -> None:
    frame = bars([
        (100, 101, 99, 100),   # 0
        (104, 106, 103, 105),  # 1: L 103 > H 101 -> zone [101, 103], 2 % of C 100
        (104, 105, 102, 103),  # 2: low 102 enters the zone
        (103, 104, 101, 102),  # 3: low 101 <= bottom -> filled
    ])  # fmt: skip
    assert find_gaps(frame, 1.0, partial=False) == [
        Gap(1, 86_400, "up", "full", 103.0, 101.0, 2.0, 3, 101.0)
    ]
    # as of bar 2: open, penetrated down to 102
    (gap,) = find_gaps(frame.take(slice(0, 3)), 1.0, partial=False)
    assert (gap.filled_index, gap.fill_price) == (None, 102.0)
    # as of bar 1: nothing after the gap bar yet
    (gap,) = find_gaps(frame.take(slice(0, 2)), 1.0, partial=False)
    assert (gap.filled_index, gap.fill_price) == (None, None)


def test_full_gap_down_and_untouched_zone() -> None:
    frame = bars([
        (50, 51, 49, 50),  # 0
        (47, 48, 46, 47),  # 1: H 48 < L 49 -> zone [48, 49]
        (46, 47, 45, 46),  # 2: high 47 stays below the zone
        (47, 48, 46, 48),  # 3: high 48 == bottom: touches, does not enter
    ])  # fmt: skip
    (gap,) = find_gaps(frame, 1.0, partial=False)
    assert (gap.direction, gap.kind, gap.top, gap.bottom) == ("down", "full", 49.0, 48.0)
    assert gap.size_pct == pytest.approx(2.0)
    assert (gap.filled_index, gap.fill_price) == (None, None)


def test_gap_down_fills_when_high_reaches_top() -> None:
    frame = bars([(50, 51, 49, 50), (47, 48, 46, 47), (47, 48.5, 46, 48), (48, 49, 47, 48)])
    (gap,) = find_gaps(frame, 0.0, partial=False)
    assert (gap.filled_index, gap.fill_price) == (3, 49.0)
    as_of_2 = find_gaps(frame.take(slice(0, 3)), 0.0, partial=False)[0]
    assert (as_of_2.filled_index, as_of_2.fill_price) == (None, 48.5)


def test_partial_gaps_only_when_asked_and_not_full() -> None:
    frame = bars([
        (100, 102, 98, 100),  # 0
        (103, 104, 99, 101),  # 1: ranges overlap, O 103 > C 100 -> partial up [100, 103]
        (99, 100, 97, 98),    # 2: O 99 < C 101 -> partial down [99, 101]; low 97 fills gap 1
    ])  # fmt: skip
    assert find_gaps(frame, 0.5, partial=False) == []
    up, down = find_gaps(frame, 0.5, partial=True)
    assert (up.direction, up.kind, up.top, up.bottom, up.size_pct) == ("up", "partial", 103, 100, 3)
    assert (up.filled_index, up.fill_price) == (2, 100.0)
    assert (down.direction, down.kind, down.top, down.bottom) == ("down", "partial", 101, 99)
    assert down.size_pct == pytest.approx(2 / 101 * 100)
    assert (down.filled_index, down.fill_price) == (None, None)


def test_min_pct_filters_small_gaps() -> None:
    frame = bars([(100, 101, 99, 100), (101.6, 102, 101.5, 101.8)])  # zone [101, 101.5] = 0.5 %
    assert len(find_gaps(frame, 0.5, partial=False)) == 1
    assert find_gaps(frame, 0.6, partial=False) == []


@pytest.mark.parametrize("n", [0, 1])
def test_too_few_bars(n: int) -> None:
    frame = bars([(1, 2, 0.5, 1)]).take(slice(0, n))
    assert find_gaps(frame, 0.0, partial=True) == []
