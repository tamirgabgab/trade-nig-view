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

from app.models.bars import FloatArray, IntArray
from app.planner.deposits import EPOCH, day_number
from app.planner.inflation import CpiPath
from app.planner.market import PlanError
from app.planner.risk import dietz_returns, max_drawdown
from app.planner.scenario import PairResult, SideResult

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
    result: PairResult


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
        points.append(Point(held, result.end, result.x.wealth, result.y.wealth, result))
    if not points:
        raise PlanError("The plan cannot run over any of the exit months")
    return Average(
        float(np.mean([p.x for p in points])),
        float(np.mean([p.y for p in points])),
        points,
        skipped,
    )


@dataclass(frozen=True, slots=True)
class SideOutcome:
    """What one realization leaves of an option: its end, and the risks along its path."""

    wealth: float
    wealth_real: float
    xirr: float | None
    xirr_real: float | None
    #: The apartment was worth less than its loan in some month (None: no apartment).
    negative_equity: bool | None
    #: The highest mortgage payment over the income of its month (None: no income given).
    stress: float | None
    #: The share of months the account was worth less than what was put into it.
    under_water: float | None
    drawdown: float
    #: Yearly returns of the net worth, the money put in taken out.
    returns: FloatArray


@dataclass(frozen=True, slots=True)
class Outcome:
    spent: float
    x: SideOutcome
    y: SideOutcome


def worth_path(side: SideResult) -> tuple[IntArray, FloatArray]:
    """An option's net worth on the way, before any exit cost or tax: its apartment's value less
    its loan while it holds it, plus its account's market value. It is followed on the
    apartment's month dates, the account's value on each being that of the last month end (so a
    deposit of the last days is not in it yet); without an apartment, and after one sold before
    the end, on the account's month ends. After such a sale the exit costs it paid (selling
    costs, early repayment fee, betterment tax) are added back, as the apartment held to the end
    pays none on the way: the sale is not a fall in the path."""
    home, market = side.home, side.market
    if home is None:
        if market is None:
            return np.array([], dtype=np.int64), np.array([])
        return np.array(market.path_days, dtype=np.int64), np.array(market.path_value)
    grid = np.array([day_number(d) for d in home.dates], dtype=np.int64)
    worth = home.value - home.balance
    if market is None:
        return grid, worth
    days, values = np.array(market.path_days, dtype=np.int64), np.array(market.path_value)
    month_end = np.searchsorted(days, grid, side="right") - 1
    worth = worth + np.where(month_end >= 0, values[np.maximum(month_end, 0)], 0.0)
    if side.home_held:
        return grid, worth
    after = days > grid[-1]  # the apartment's money is in the account from its sale
    paid = float(home.value[-1] - home.balance[-1] - home.net_worth[-1])
    return np.append(grid, days[after]), np.append(worth, values[after] + paid)


def _side_outcome(
    side: SideResult, result: PairResult, cpi: CpiPath, income: float | None
) -> SideOutcome:
    """The path risks of one option, on its net worth on the way (:func:`worth_path`). A net
    worth below zero counts as zero in the drawdown: the whole peak is lost. The money put in
    includes the apartment's bills of the last day, which the ledger settles in cash. Yearly
    returns use every twelfth point: a last part of a year is left out."""
    home, market = side.home, side.market
    last = 0.0
    if home is not None and side.home_held:  # bills of the end day, settled in cash
        last = float(home.payment[-1] + home.costs[-1] - home.rent[-1])
    days: IntArray = np.append(result.days, day_number(result.end))
    put_in = np.cumsum(np.append(result.budget, last))
    grid, worth = worth_path(side)
    stress = None
    if home is not None and income is not None and len(home.payment) > 1:
        months = grid[1 : len(home.payment)]
        earned = income * cpi.at(months) / cpi.at(int(days[0]))
        stress = float(np.max(home.payment[1:] / earned))
    yearly = worth[::12].copy()
    paid = np.searchsorted(days, grid[::12], side="right") - 1
    paid_in = np.where(paid >= 0, put_in[np.maximum(paid, 0)], 0.0)
    if len(yearly):
        yearly[0] = paid_in[0]  # the first point is the money put in so far: costs are a loss
    under_water = None
    if market is not None:
        deposited = np.array(market.path_deposited)
        under_water = float(np.mean(np.array(market.path_value) < deposited * (1.0 - 1e-12)))
    return SideOutcome(
        wealth=side.wealth,
        wealth_real=side.wealth_real,
        xirr=side.xirr,
        xirr_real=side.xirr_real,
        negative_equity=None if home is None else bool(np.any(home.value < home.balance)),
        stress=stress,
        under_water=under_water,
        drawdown=max_drawdown(np.maximum(worth, 0.0)) if len(worth) else 0.0,
        returns=dietz_returns(yearly, np.diff(paid_in)) if len(yearly) > 1 else np.array([]),
    )


def outcome(result: PairResult, cpi: CpiPath, income: float | None = None) -> Outcome:
    """One realization reduced to what the layer-2 metrics need. ``income``: the monthly
    income on the scenario's first day, in shekels; it rises with the CPI."""
    return Outcome(
        spent=float(result.budget.sum()),
        x=_side_outcome(result.x, result, cpi, income),
        y=_side_outcome(result.y, result, cpi, income),
    )
