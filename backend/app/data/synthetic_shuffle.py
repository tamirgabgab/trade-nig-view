r"""A shuffled copy of a market symbol (K3, ADR 0034): the source's bars in another order.

**Ratios.** The source's dividend-adjusted daily bars in ``[start, end]`` are
:math:`t = 0 \dots n-1`. Every bar after the first is kept as its ratios to the previous close,

.. math::
    o_t = \frac{O_t}{C_{t-1}}, \quad h_t = \frac{H_t}{C_{t-1}}, \quad
    \ell_t = \frac{L_t}{C_{t-1}}, \quad c_t = \frac{C_t}{C_{t-1}} \qquad (t \ge 1),

and its volume :math:`V_t`.

**Blocks.** Bars :math:`1 \dots n-1` are cut in order into blocks of ``block_days`` (the last one
may be shorter), and the blocks are put in an order drawn from ``default_rng([seed, 5])``: a
permutation, drawn again while it leaves every block in place. :math:`\pi(t)` is the source bar
that lands on day :math:`t` (:math:`\pi(0) = 0`).

**Rebuild.** Day 0 is the source's first bar; then, on the source's dates,

.. math::
    C'_t = C'_{t-1}\, c_{\pi(t)}, \quad O'_t = C'_{t-1}\, o_{\pi(t)}, \quad
    H'_t = C'_{t-1}\, h_{\pi(t)}, \quad L'_t = C'_{t-1}\, \ell_{\pi(t)}, \quad V'_t = V_{\pi(t)}.

:math:`\prod_t c_{\pi(t)} = \prod_t c_t`, so :math:`C'_{n-1} = C_{n-1}`: the copy has the source's
first bar, last close, total return and set of daily bars; only their order changes (each block
keeps its own days in order, so a block's trend and its volatility clusters stay). A bar whose open
or close lies outside its range by the validator's tolerance gets its high and low widened to them.

The dates are the source's, weekends included for a source that trades on them; the copy's 1h
bars are stamped 09:30-16:00 New York on each date, as every synthetic symbol's.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np

from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, IntArray, date_to_ts
from app.models.synthetic import ShuffleDefinition

#: The fewest bars a copy has (as the other kinds).
MIN_BARS = 100
#: Points of the dialog's chart (the first and the last are always among them).
PREVIEW_POINTS = 400


def source_slice(definition: ShuffleDefinition, adjusted: BarFrame) -> BarFrame:
    """The source's dividend-adjusted daily bars in ``[start, end]``, or ``ValueError`` (too few,
    too few for two blocks, a price that is not positive)."""
    days = adjusted.time // SECONDS_PER_DAY
    keep = (days >= _day(definition.start)) & (days <= _day(definition.end))
    frame = adjusted.take(keep)
    n = len(frame)
    if n < MIN_BARS:
        raise ValueError(
            f"{definition.source} has {n} daily bars from {definition.start} to"
            f" {definition.end}: a copy needs {MIN_BARS} at least"
        )
    if definition.block_days >= n - 1:
        raise ValueError(
            f"Blocks of {definition.block_days} bars leave one block of {n - 1}: nothing to"
            " shuffle (shorter blocks or a longer range)"
        )
    if min(frame.open.min(), frame.low.min(), frame.close.min()) <= 0:
        raise ValueError(f"{definition.source} has a price of 0 or less in the range")
    return frame


def block_order(moves: int, block_days: int, seed: int) -> IntArray:
    """The source bars (1 to ``moves``) in their new order: the ``ceil(moves / block_days)``
    blocks permuted, never all in place (two blocks at least, else ``ValueError``)."""
    starts = np.arange(1, moves + 1, block_days)
    if len(starts) < 2:  # noqa: PLR2004
        raise ValueError(
            f"Blocks of {block_days} bars leave one block of {moves}: nothing to shuffle"
        )
    blocks: list[IntArray] = [np.arange(s, min(s + block_days, moves + 1)) for s in starts]
    rng = np.random.default_rng([seed, 5])
    order = rng.permutation(len(blocks))
    while np.array_equal(order, np.arange(len(blocks))):
        order = rng.permutation(len(blocks))
    return np.concatenate([blocks[int(i)] for i in order])


def shuffled(source: BarFrame, block_days: int, seed: int) -> BarFrame:
    """The copy's daily bars (module docstring), on the source's dates."""
    prev = source.close[:-1]
    ratios = [col[1:] / prev for col in (source.open, source.high, source.low, source.close)]
    pick = block_order(len(source) - 1, block_days, seed) - 1
    o, h, low, c = (r[pick] for r in ratios)
    close = source.close[0] * np.concatenate(([1.0], np.cumprod(c)))
    before = close[:-1]
    day_open = np.concatenate((source.open[:1], before * o))
    high = np.concatenate((source.high[:1], before * h))
    low_ = np.concatenate((source.low[:1], before * low))
    return BarFrame.from_columns(
        time=source.time.copy(),
        open=day_open,
        high=np.maximum(high, np.maximum(day_open, close)),
        low=np.minimum(low_, np.minimum(day_open, close)),
        close=close,
        volume=np.concatenate((source.volume[:1], source.volume[1:][pick])),
    )


@dataclass(frozen=True, slots=True)
class Measures:
    """A path's sequence: its total return, its deepest fall from a running peak of the closes,
    its worst calendar year (from the previous year's last close, or the range's first close, to
    the year's last close; the first and last years may be partial), and its longest run of
    closes below the previous close. Percentages."""

    total_return_pct: float
    max_drawdown_pct: float
    worst_year: int
    worst_year_pct: float
    longest_losing_streak: int


def measures(time: IntArray, close: FloatArray) -> Measures:
    r"""The sequence of the closes :math:`C_0 \dots C_{n-1}` at ``time``:

    .. math::
        R = \frac{C_{n-1}}{C_0} - 1, \qquad
        D = \min_t \Big(\frac{C_t}{\max_{s \le t} C_s} - 1\Big), \qquad
        Y_y = \frac{C_{\text{last}(y)}}{C_{\text{last}(y-1)}} - 1

    with :math:`C_{\text{last}(y-1)} = C_0` for the first year, the worst year the smallest
    :math:`Y_y`, and the longest losing streak the longest run of :math:`C_t < C_{t-1}`.
    """
    peak = np.maximum.accumulate(close)
    years = (time // SECONDS_PER_DAY).astype("datetime64[D]").astype("datetime64[Y]")
    last = np.flatnonzero(np.r_[years[1:] != years[:-1], True])  # each year's last bar
    base = np.r_[close[0], close[last[:-1]]]
    yearly = close[last] / base - 1
    worst = int(np.argmin(yearly))
    down = close[1:] < close[:-1]
    run = longest = 0
    for is_down in down:
        run = run + 1 if is_down else 0
        longest = max(longest, run)
    return Measures(
        total_return_pct=float(close[-1] / close[0] - 1) * 100,
        max_drawdown_pct=float((close / peak - 1).min()) * 100,
        worst_year=int(str(years[last[worst]])),
        worst_year_pct=float(yearly[worst]) * 100,
        longest_losing_streak=longest,
    )


def chart_points(n: int) -> IntArray:
    """At most ``PREVIEW_POINTS`` evenly spread bars, the first and the last among them."""
    return np.unique(np.linspace(0, n - 1, min(n, PREVIEW_POINTS)).round().astype(np.int64))


def _day(day: date) -> int:
    return date_to_ts(day) // SECONDS_PER_DAY
