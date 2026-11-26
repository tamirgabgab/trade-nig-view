"""Layer 1 of the comparison metrics: which option is better (``docs/HOME_VS_MARKET_PLAN.md``).

Every function here takes a callable that runs one paired scenario (``app.planner.scenario``)
and raises ``PlanError`` when it cannot, so the same metrics serve rolling history now and
resampled or simulated paths later.

**Rolling windows.** The same plan is started on many dates; each start is one realization.
With :math:`n` windows of end values :math:`X_i, Y_i`:

* :math:`P(X > Y) = \\frac{1}{n} \\sum_i \\big(\\mathbb{1}[X_i > Y_i] + \\tfrac12
  \\mathbb{1}[X_i = Y_i]\\big)`: a tie counts as half, so two identical options score 0.5;
* the median of :math:`X_i - Y_i`, and the median yearly return (XIRR) of each option.

**Overlapping windows are not independent.** Starts spread over a span :math:`S` with a term
:math:`T` cover :math:`S + T` of history, which holds about :math:`(S + T) / T` separate terms:
the effective number of independent samples, far below :math:`n`.

**A breakeven rate** is the value of one input at which the two options end equal, found by
bisection on the difference of the end values. It needs no forecast: the user compares it with
their own expectation. When the difference has the same sign at both ends of the range there is
no breakeven in it.

**The win map** runs the plan for every start and every horizon of a grid.

**Time-averaged net worth** is :math:`\\frac{1}{n} \\sum_k W(t_k)`: the expected end value when
the exit month is drawn evenly from :math:`t_1 .. t_n`. An apartment loses early, to its
purchase costs.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np

from app.models.bars import FloatArray
from app.planner.deposits import EPOCH
from app.planner.market import PlanError
from app.planner.scenario import PairResult

BISECTIONS = 100


@dataclass(frozen=True, slots=True)
class Window:
    #: Months the plan was moved by, and its first day.
    shift: int
    start: date
    result: PairResult


@dataclass(frozen=True, slots=True)
class Summary:
    windows: int
    first: date
    last: date
    #: About how many independent terms the windows hold.
    effective: float
    p_win: float
    median_difference: float
    median_difference_real: float
    #: Median yearly returns (None when no window has one).
    x_xirr: float | None
    y_xirr: float | None
    x_xirr_real: float | None
    y_xirr_real: float | None


@dataclass(frozen=True, slots=True)
class Cell:
    shift: int
    months: int
    #: None: the plan cannot run from this start over this horizon.
    result: PairResult | None


@dataclass(frozen=True, slots=True)
class Point:
    months: int
    end: date
    x: float
    y: float


@dataclass(frozen=True, slots=True)
class Average:
    x: float
    y: float
    points: list[Point]
    #: Exit months that could not run, and so are not in the average.
    skipped: int


def win_probability(x: FloatArray, y: FloatArray) -> float:
    """:math:`P(X > Y)` over paired values, a tie counting as half."""
    return float(np.mean(np.where(x > y, 1.0, np.where(x == y, 0.5, 0.0))))


def effective_samples(span_months: float, term_months: float) -> float:
    """About how many independent terms fit in starts spread over ``span_months``."""
    return (span_months + term_months) / term_months


def rolling(
    run: Callable[[int], PairResult], shifts: Iterable[int]
) -> tuple[list[Window], list[tuple[int, str]]]:
    """Run the plan moved by each shift (in months). Returns the windows that ran, and the
    shifts that could not with the reason."""
    windows: list[Window] = []
    skipped: list[tuple[int, str]] = []
    for shift in shifts:
        try:
            result = run(shift)
        except PlanError as exc:
            skipped.append((shift, str(exc)))
            continue
        windows.append(Window(shift, EPOCH + timedelta(days=int(result.days[0])), result))
    return windows, skipped


def _median(values: Sequence[float | None]) -> float | None:
    known = [v for v in values if v is not None]
    return float(np.median(known)) if known else None


def summarize(windows: Sequence[Window], term_months: int) -> Summary:
    """The layer-1 numbers of a set of windows of a plan that runs ``term_months``."""
    if not windows:
        raise PlanError("No window of the plan can run on this data")
    if term_months < 1:
        raise PlanError("A plan must run for at least a month to be studied over history")
    x = np.array([w.result.x.wealth for w in windows])
    y = np.array([w.result.y.wealth for w in windows])
    real = [w.result.x.wealth_real - w.result.y.wealth_real for w in windows]
    first, last = windows[0].start, windows[-1].start
    span = (last.year - first.year) * 12 + last.month - first.month
    return Summary(
        windows=len(windows),
        first=first,
        last=last,
        effective=effective_samples(span, term_months),
        p_win=win_probability(x, y),
        median_difference=float(np.median(x - y)),
        median_difference_real=float(np.median(real)),
        x_xirr=_median([w.result.x.xirr for w in windows]),
        y_xirr=_median([w.result.y.xirr for w in windows]),
        x_xirr_real=_median([w.result.x.xirr_real for w in windows]),
        y_xirr_real=_median([w.result.y.xirr_real for w in windows]),
    )


def breakeven(
    difference: Callable[[float], float], low: float, high: float, tolerance: float = 1e-10
) -> float | None:
    """The input between ``low`` and ``high`` at which ``difference`` is zero, or None when its
    sign is the same at both ends (or the plan cannot run there)."""
    try:
        f_low, f_high = difference(low), difference(high)
        if not (np.isfinite(f_low) and np.isfinite(f_high)) or f_low * f_high > 0:
            return None
        for _ in range(BISECTIONS):
            if high - low < tolerance:
                break
            mid = (low + high) / 2.0
            f_mid = difference(mid)
            if f_low * f_mid <= 0:
                high = mid
            else:
                low, f_low = mid, f_mid
    except PlanError:
        return None
    return (low + high) / 2.0


def win_map(
    run: Callable[[int, int], PairResult], shifts: Iterable[int], horizons: Sequence[int]
) -> list[Cell]:
    """A cell per start (a shift in months) and horizon (in months), starts outermost."""
    cells: list[Cell] = []
    for shift in shifts:
        for months in horizons:
            try:
                cells.append(Cell(shift, months, run(shift, months)))
            except PlanError:
                cells.append(Cell(shift, months, None))
    return cells


def time_average(run: Callable[[int], PairResult], months: Iterable[int]) -> Average:
    """The end values averaged over the exit months that can run."""
    points: list[Point] = []
    skipped = 0
    for held in months:
        try:
            result = run(held)
        except PlanError:
            skipped += 1
            continue
        points.append(Point(held, result.end, result.x.wealth, result.y.wealth))
    if not points:
        raise PlanError("The plan cannot run over any of the exit months")
    return Average(
        float(np.mean([p.x for p in points])),
        float(np.mean([p.y for p in points])),
        points,
        skipped,
    )
