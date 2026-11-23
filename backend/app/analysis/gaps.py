r"""Price gaps between consecutive bars and whether later bars filled them.

Definitions (docs/TRADINGVIEW_RESEARCH.md section 6), for bar :math:`t \ge 1`:

* **Full gap up**: :math:`L_t > H_{t-1}`, zone :math:`[H_{t-1}, L_t]`.
  **Full gap down**: :math:`H_t < L_{t-1}`, zone :math:`[H_t, L_{t-1}]`.
* **Partial gap** (only with ``partial=True`` and only where there is no full gap): the ranges
  overlap but the open jumps, :math:`O_t > C_{t-1}` (up) or :math:`O_t < C_{t-1}` (down); zone
  :math:`[C_{t-1}, O_t]` (ordered).
* **Size**: :math:`(\text{top} - \text{bottom}) / C_{t-1} \cdot 100 \ge` ``min_pct``.
* **Fill**: a gap up is filled at the first :math:`k > t` with :math:`L_k \le \text{bottom}`, a
  gap down at the first :math:`k > t` with :math:`H_k \ge \text{top}`.
* **Fill price** (deepest penetration into the zone so far): for a gap up the lowest low after
  :math:`t` if it is below ``top`` (for a gap down the highest high after :math:`t` if it is
  above ``bottom``), ``None`` while no bar has entered the zone. Once filled it is ``bottom`` (gap
  up) / ``top`` (gap down).

Every field of a gap known at bar :math:`k` uses only bars :math:`\le k`: computing on
``bars[:k+1]`` gives the gaps with ``index <= k`` exactly as of bar :math:`k` (fill status and
fill price included). Detection is vectorised; the fill is a numpy scan of the bars after each gap,
O(N per gap), cheap because gaps are rare.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.models.bars import BarFrame, FloatArray

GapDirection = Literal["up", "down"]
GapKind = Literal["full", "partial"]


@dataclass(frozen=True, slots=True)
class Gap:
    index: int  #: bar t (the bar after the gap)
    time: int  #: ``frame.time[t]`` (UTC epoch seconds)
    direction: GapDirection
    kind: GapKind
    top: float
    bottom: float
    size_pct: float
    filled_index: int | None
    fill_price: float | None


def _fill(
    frame: BarFrame, t: int, direction: GapDirection, top: float, bottom: float
) -> tuple[int | None, float | None]:
    """(filled_index, fill_price) of a gap at bar ``t`` given the bars after it."""
    if direction == "up":
        after = frame.low[t + 1 :]
        hits = np.flatnonzero(after <= bottom)
        if hits.size:
            return t + 1 + int(hits[0]), bottom
        deepest = float(after.min()) if after.size else top
        return None, deepest if deepest < top else None
    after = frame.high[t + 1 :]
    hits = np.flatnonzero(after >= top)
    if hits.size:
        return t + 1 + int(hits[0]), top
    deepest = float(after.max()) if after.size else bottom
    return None, deepest if deepest > bottom else None


def find_gaps(frame: BarFrame, min_pct: float, partial: bool) -> list[Gap]:
    """Every gap of at least ``min_pct`` percent in ``frame``, sorted by bar index."""
    o, h, lo = frame.open[1:], frame.high[1:], frame.low[1:]
    prev_h, prev_l, prev_c = frame.high[:-1], frame.low[:-1], frame.close[:-1]
    full_up = lo > prev_h
    full_down = h < prev_l
    partial_up = partial & ~full_up & ~full_down & (o > prev_c)
    partial_down = partial & ~full_up & ~full_down & (o < prev_c)
    up = full_up | partial_up
    top: FloatArray = np.select([full_up, full_down, partial_up], [lo, prev_l, o], default=prev_c)
    bottom: FloatArray = np.select([full_up, full_down, partial_up], [prev_h, h, prev_c], default=o)
    size_pct = (top - bottom) / prev_c * 100.0
    found = (full_up | full_down | partial_up | partial_down) & (size_pct >= min_pct)
    gaps: list[Gap] = []
    for i in np.flatnonzero(found).tolist():
        t = i + 1
        direction: GapDirection = "up" if up[i] else "down"
        top_i, bottom_i = float(top[i]), float(bottom[i])
        filled_index, fill_price = _fill(frame, t, direction, top_i, bottom_i)
        gaps.append(
            Gap(
                index=t,
                time=int(frame.time[t]),
                direction=direction,
                kind="full" if full_up[i] or full_down[i] else "partial",
                top=top_i,
                bottom=bottom_i,
                size_pct=float(size_pct[i]),
                filled_index=filled_index,
                fill_price=fill_price,
            )
        )
    return gaps
