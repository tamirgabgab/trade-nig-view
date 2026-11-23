r"""Event study: what the close did ``h`` bars after a signal, compared with any bar.

Forward log return, for every bar :math:`t` with :math:`t + h < n`:

.. math:: r_t = \ln(C_{t+h} / C_t)

* **Baseline**: :math:`r_t` for every such :math:`t` (the unconditional distribution).
* **Events**: :math:`r_t` for the signal bars with :math:`t + h < n`. With ``episodes=True`` a
  signal at most :math:`h` bars after the last counted event (:math:`t - t_{last} \le h`) is
  skipped, so a condition that stays true for a run of bars counts once per episode and the
  counted samples overlap less.

For each sample: :math:`n`, mean, median, :math:`s` (std, ``ddof=1``; NaN for :math:`n < 2`) and
hit rate (share with :math:`r > 0`). Then

.. math::

    \text{edge} = \bar r_{ev} - \bar r_{base}, \quad
    \text{se} = s_{ev} / \sqrt{n_{ev}}, \quad
    t = \text{edge} / \text{se}, \quad
    \text{CI}_{95} = \text{edge} \pm 1.96\,\text{se}

(NaN where undefined). The baseline's own sampling error is ignored: it has many more samples than
the events. The histogram has 21 bins shared by both samples, spanning the 1st to 99th percentile of
the baseline returns; returns outside that range go to the outer bins, and counts are fractions of
each sample (summing to 1).

Caveats (also shown in the learn pages): forward windows of nearby bars overlap, so samples are not
independent and ``t`` overstates significance (the baseline overlaps the most); trying many
conditions and keeping the best one is multiple testing, and a :math:`|t| > 2` will turn up by
chance; this is not a backtest (no costs, no exits, no position sizing) and not financial advice.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from app.models.bars import FloatArray, IntArray

HISTOGRAM_BINS = 21
Z_95 = 1.96


@dataclass(frozen=True, slots=True)
class Stats:
    n: int
    mean: float
    median: float
    std: float
    hit_rate: float


@dataclass(frozen=True, slots=True)
class EventStudy:
    horizon: int
    events: Stats
    baseline: Stats
    edge: float
    se: float
    t_stat: float
    ci95: tuple[float, float]
    #: ``HISTOGRAM_BINS + 1`` shared bin edges (empty if there is no baseline sample).
    edges: FloatArray
    events_hist: FloatArray
    baseline_hist: FloatArray
    #: Bars of the counted events (chart markers).
    event_index: IntArray


def _stats(r: FloatArray) -> Stats:
    n = len(r)
    if n == 0:
        return Stats(0, math.nan, math.nan, math.nan, math.nan)
    return Stats(
        n=n,
        mean=float(r.mean()),
        median=float(np.median(r)),
        std=float(r.std(ddof=1)) if n >= 2 else math.nan,  # noqa: PLR2004 - ddof=1 needs two
        hit_rate=float((r > 0).mean()),
    )


def _episodes(candidates: IntArray, horizon: int) -> IntArray:
    """``candidates`` without those at most ``horizon`` bars after the last kept one."""
    kept: list[int] = []
    for t in candidates.tolist():
        if not kept or t - kept[-1] > horizon:
            kept.append(t)
    return np.asarray(kept, dtype=np.int64)


def _fractions(r: FloatArray, edges: FloatArray) -> FloatArray:
    if len(r) == 0:
        return np.zeros(len(edges) - 1)
    counts, _ = np.histogram(np.clip(r, edges[0], edges[-1]), bins=edges)
    return counts / len(r)


def event_study(
    close: FloatArray, signal: npt.NDArray[np.bool_], horizon: int, episodes: bool = True
) -> EventStudy:
    """Forward ``horizon``-bar log returns after the ``signal`` bars against all bars."""
    n = len(close)
    valid = max(n - horizon, 0)
    r = np.log(close[horizon:] / close[:valid]) if valid else np.empty(0)
    index = np.flatnonzero(signal[:valid]).astype(np.int64)
    if episodes:
        index = _episodes(index, horizon)
    ev, base = r[index], r
    ev_stats, base_stats = _stats(ev), _stats(base)
    edge = ev_stats.mean - base_stats.mean
    se = ev_stats.std / math.sqrt(ev_stats.n) if ev_stats.n else math.nan
    t_stat = edge / se if se > 0 else math.nan
    if len(base):
        lo, hi = (float(q) for q in np.percentile(base, [1, 99]))
        if hi <= lo:  # a constant baseline: give the bins some width
            lo, hi = lo - 1e-9, hi + 1e-9
        edges = np.linspace(lo, hi, HISTOGRAM_BINS + 1)
        ev_hist, base_hist = _fractions(ev, edges), _fractions(base, edges)
    else:
        edges = ev_hist = base_hist = np.empty(0)
    return EventStudy(
        horizon=horizon,
        events=ev_stats,
        baseline=base_stats,
        edge=edge,
        se=se,
        t_stat=t_stat,
        ci95=(edge - Z_95 * se, edge + Z_95 * se),
        edges=edges,
        events_hist=ev_hist,
        baseline_hist=base_hist,
        event_index=index,
    )
