"""Property tests for the R5 market-structure code: no lookahead, golden agreement on random bars,
and gap fill monotonicity."""

from __future__ import annotations

from dataclasses import replace

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st
from hypothesis.extra.numpy import arrays

from app.analysis.gaps import Gap, find_gaps
from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame
from tests.golden.harness import check_no_lookahead
from tests.golden.models import golden_pivots, golden_prev_hlc
from tests.golden.test_golden_structure import as_golden, golden_of
from tests.property.test_bands_oscillators_properties import bars

#: Time steps between bars: an hour, a day, a weekend, a month (period edges get crossed often).
STEPS = st.sampled_from([3_600, 3_600, 86_400, 3 * 86_400, 31 * 86_400])


@st.composite
def timed_bars(draw: st.DrawFn) -> BarFrame:
    """``bars()`` with irregular, strictly increasing times starting anywhere from 1965 on."""
    frame = draw(bars())
    steps = draw(arrays(np.int64, len(frame), elements=STEPS))
    start = draw(st.integers(-160_000_000, 1_800_000_000))
    return replace(frame, time=start + np.cumsum(steps))


@st.composite
def priced_bars(draw: st.DrawFn) -> BarFrame:
    """``bars()`` lifted so every price is >= 1 (gap sizes are relative to a positive close)."""
    frame = draw(bars())
    lift = max(0.0, 1.0 - float(frame.low.min()))
    return replace(
        frame,
        open=frame.open + lift,
        high=frame.high + lift,
        low=frame.low + lift,
        close=frame.close + lift,
    )


def _ks(data: st.DataObject, frame: BarFrame) -> list[int]:
    return data.draw(st.lists(st.integers(0, len(frame) - 1), min_size=1, max_size=4, unique=True))


@settings(max_examples=60, deadline=None)
@given(data=st.data(), frame=timed_bars(), period=st.sampled_from(["day", "week", "month"]))
def test_prev_hlc_no_lookahead_and_golden(
    data: st.DataObject, frame: BarFrame, period: str
) -> None:
    spec = CATALOG["prev_hlc"]
    check_no_lookahead(spec, frame, {"period": period}, _ks(data, frame))
    out = spec.run(frame, {"period": period})
    days = frame.time if frame.session is None else frame.session * 86_400
    want = golden_prev_hlc(
        days.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist(), period
    )
    for name, values in zip(("high", "low", "close"), want, strict=True):
        np.testing.assert_array_equal(out[name], values)


@settings(max_examples=60, deadline=None)
@given(
    data=st.data(),
    frame=bars(max_size=120),
    left=st.integers(1, 12),
    right=st.integers(1, 12),
)
def test_pivots_no_lookahead_and_golden(
    data: st.DataObject, frame: BarFrame, left: int, right: int
) -> None:
    spec = CATALOG["pivots"]
    params = {"left": left, "right": right}
    check_no_lookahead(spec, frame, params, _ks(data, frame))
    out = spec.run(frame, params)
    want_high, want_low = golden_pivots(frame.high.tolist(), frame.low.tolist(), left, right)
    np.testing.assert_array_equal(out["high"], want_high)
    np.testing.assert_array_equal(out["low"], want_low)
    # a confirmed pivot sits exactly R bars after its bar
    t = np.flatnonzero(~np.isnan(out["high"]))
    np.testing.assert_array_equal(out["high"][t], frame.high[t - right])


GAP_SETTINGS = st.tuples(st.sampled_from([0.0, 0.5, 2.0]), st.booleans())


def _identity(gap: Gap) -> tuple[object, ...]:
    return (gap.index, gap.time, gap.direction, gap.kind, gap.top, gap.bottom, gap.size_pct)


def _not_shallower(earlier: Gap, later: Gap) -> bool:
    """``later.fill_price`` is at least as deep into the zone as ``earlier.fill_price``."""
    if earlier.fill_price is None:
        return True
    if later.fill_price is None:
        return False
    if earlier.direction == "up":
        return later.fill_price <= earlier.fill_price
    return later.fill_price >= earlier.fill_price


@settings(max_examples=80, deadline=None)
@given(data=st.data(), frame=priced_bars(), setting=GAP_SETTINGS)
def test_gaps_no_lookahead(
    data: st.DataObject, frame: BarFrame, setting: tuple[float, bool]
) -> None:
    """On ``bars[:k+1]`` the gaps with index <= k are the full result's gaps as of bar k: same
    zones, fills only once they happened by k, fill prices exactly the golden state at k."""
    min_pct, partial = setting
    full = find_gaps(frame, min_pct, partial)
    for k in _ks(data, frame):
        prefix_frame = frame.take(slice(0, k + 1))
        prefix = find_gaps(prefix_frame, min_pct, partial)
        known = [g for g in full if g.index <= k]
        assert [_identity(g) for g in prefix] == [_identity(g) for g in known]
        assert [as_golden(g) for g in prefix] == golden_of(prefix_frame, min_pct, partial)
        for now, final in zip(prefix, known, strict=True):
            if final.filled_index is not None and final.filled_index <= k:
                assert (now.filled_index, now.fill_price) == (final.filled_index, final.fill_price)
            else:
                assert now.filled_index is None
            assert _not_shallower(now, final)


@settings(max_examples=60, deadline=None)
@given(frame=priced_bars(), setting=GAP_SETTINGS)
def test_gap_fill_only_deepens_as_bars_arrive(frame: BarFrame, setting: tuple[float, bool]) -> None:
    min_pct, partial = setting
    previous: dict[int, Gap] = {}
    for k in range(len(frame)):
        current = {g.index: g for g in find_gaps(frame.take(slice(0, k + 1)), min_pct, partial)}
        assert previous.keys() <= current.keys()
        for index, before in previous.items():
            after = current[index]
            assert _not_shallower(before, after)
            if before.filled_index is not None:
                assert after == before  # a filled gap never changes again
        for gap in current.values():
            assert gap.bottom < gap.top
            if gap.filled_index is not None:
                assert gap.fill_price == (gap.bottom if gap.direction == "up" else gap.top)
            else:
                assert gap.fill_price is None or gap.bottom < gap.fill_price < gap.top
        previous = current
