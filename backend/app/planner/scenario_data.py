"""Builds a paired scenario (``app.planner.scenario``) from a description of its two options,
moved in time or changed in one input.

A :class:`ScenarioSpec` holds each option's apartment (and where its series come from), its
market account and its deposits, as the user set them. :func:`build` turns it into the arrays of
one realization, under a :class:`Change`:

* **shift**: every date moves by this many months (a window of history);
* **months**: another horizon. The scenario's term is its first apartment's months held (or,
  without an apartment, the months from the first deposit to the end); a horizon of
  :math:`h` moves every sale and the end by :math:`h` minus that term;
* **historical**: the realization is a window of real data, so
  - a series that would be held flat past its last published value refuses the window;
  - every asset must have bars from the window's first day (the youngest asset limits it);
  - the betterment tax's linear rule is off: it depends on the calendar date 2014-01-01, and a
    window stands for a plan that starts today;
  - with ``follow_rates``, the rates of the tracks move with the Bank of Israel rate: a fixed or
    variable track that is not CPI-linked gets its rate plus
    :math:`a(d_0') - a_{\\text{now}}`, the Bank of Israel rate on the window's purchase day minus
    the last published one (the user's rates are today's quotes). So the window that starts on
    the plan's own day differs from the plan as entered, unless that day is today. Prime tracks
    follow the rate by themselves; linked tracks keep a real rate. Only for an apartment whose
    rates are historical.
* **appreciation**, **market_return**, **rate_shift**, **rent_scale**: one input replaced, for the
  breakeven rates: every apartment's value grows by a constant yearly rate; every account holds
  one asset growing by a constant yearly rate in shekels; every track's rate (a prime track's
  spread) moves by a constant; every rent is multiplied.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import date, timedelta

import numpy as np

from app.planner.data import InflationSpec, Macro, cpi_path
from app.planner.deposits import EPOCH, Deposit, Recurring, add_months, day_number, expand
from app.planner.home_data import MONTH_DAYS, HomeSpec, home_series
from app.planner.inflation import CpiPath
from app.planner.market import DAYS_PER_YEAR, MAX_STALE_DAYS, AssetData, PlanError
from app.planner.mortgage import RateKind
from app.planner.scenario import Account, PairResult, Side, run_pair


@dataclass(frozen=True, slots=True)
class OptionSpec:
    home: HomeSpec | None = None
    account: Account | None = None
    one_off: Sequence[Deposit] = ()
    recurring: Sequence[Recurring] = ()
    #: Draws the account's unknown fill times anew in every realization.
    fill_seed: int | None = None


@dataclass(frozen=True, slots=True)
class ScenarioSpec:
    x: OptionSpec
    y: OptionSpec
    end: date
    inflation: InflationSpec = field(default_factory=InflationSpec)


@dataclass(frozen=True, slots=True)
class Change:
    shift: int = 0
    months: int | None = None
    historical: bool = False
    follow_rates: bool = True
    appreciation: float | None = None
    market_return: float | None = None
    rate_shift: float = 0.0
    rent_scale: float = 1.0


def _date(day: int) -> date:
    return EPOCH + timedelta(days=day)


def _first_day(option: OptionSpec) -> list[date]:
    days = [d.day for d in option.one_off] + [r.start for r in option.recurring]
    return days if option.home is None else [*days, option.home.plan.start]


def first_day(spec: ScenarioSpec) -> date:
    """The day the scenario's first money is spent."""
    days = _first_day(spec.x) + _first_day(spec.y)
    if not days:
        raise PlanError("There is nothing to compare: neither option has an apartment or a deposit")
    return min(days)


def _homes(spec: ScenarioSpec) -> list[HomeSpec]:
    return [o.home for o in (spec.x, spec.y) if o.home is not None]


def term_months(spec: ScenarioSpec) -> int:
    """The scenario's term: the first apartment's months held, or the months from the first
    deposit to the end."""
    homes = _homes(spec)
    if homes:
        return homes[0].plan.months
    first = first_day(spec)
    return (spec.end.year - first.year) * 12 + spec.end.month - first.month


def growing_asset(rate: float, first: int, last: int) -> AssetData:
    """An asset with a bar on every day of ``first .. last`` that grows by ``rate`` a year."""
    days = np.arange(first, last + 1, dtype=np.int64)
    close = (1.0 + rate) ** ((days - first) / DAYS_PER_YEAR)
    ones = np.ones(len(days))
    return AssetData("RETURN", 1.0, days, close, close, close, close, ones, ones)


def _rate_move(macro: Macro, day: date) -> float:
    """The Bank of Israel rate on ``day`` (the last one published on or before it) minus the
    last published one, as a fraction."""
    series = macro.get("boi_rate").data
    index = int(np.searchsorted(series.days, day_number(day), side="right")) - 1
    if index < 0:
        raise PlanError(f"The Bank of Israel rate starts on {_date(int(series.days[0]))}")
    return float(series.values[index] - series.values[-1]) / 100.0


def _moved_home(spec: HomeSpec, change: Change, delta: int, macro: Macro) -> HomeSpec:
    plan = spec.plan
    months = plan.months + delta
    if months < 1:
        raise PlanError("The apartment must be held for at least a month")
    start = add_months(plan.start, change.shift)
    follow = 0.0
    if change.historical and change.follow_rates and spec.rates_mode == "historical":
        follow = _rate_move(macro, start)
    tracks = [
        replace(
            t,
            rate=t.rate
            + change.rate_shift
            + (follow if t.kind is not RateKind.PRIME and not t.linked else 0.0),
        )
        for t in plan.tracks
    ]
    plan = replace(
        plan,
        start=start,
        months=months,
        tracks=tracks,
        rent=plan.rent * change.rent_scale,
    )
    if change.historical:
        plan = replace(plan, betterment=replace(plan.betterment, linear=False))
    if change.appreciation is not None:
        return replace(
            spec,
            plan=plan,
            value_mode="assumed",
            value_mean=change.appreciation,
            value_sd=0.0,
            value_seed=None,
        )
    return replace(spec, plan=plan)


def _covers(account: Account, first: int, last: int) -> None:
    """A window of history needs every asset's bars from its first day to its end."""
    for asset in account.assets:
        if first < asset.days[0]:
            raise PlanError(f"{asset.symbol} has no data before {_date(int(asset.days[0]))}")
        if last - asset.days[-1] > MAX_STALE_DAYS:
            raise PlanError(f"{asset.symbol} has no data after {_date(int(asset.days[-1]))}")


def build(
    spec: ScenarioSpec, macro: Macro, change: Change = Change()
) -> tuple[Side, Side, date, CpiPath, list[str]]:
    """The two options of one realization, its end date, its CPI and warnings."""
    delta = 0 if change.months is None else change.months - term_months(spec)
    homes = [
        None if o.home is None else _moved_home(o.home, change, delta, macro)
        for o in (spec.x, spec.y)
    ]
    sold = [add_months(h.plan.start, h.plan.months) for h in homes if h is not None]
    end = sold[0] if sold else add_months(spec.end, change.shift + delta)
    first = day_number(add_months(first_day(spec), change.shift))
    end_day = day_number(end)
    if end_day <= first:
        raise PlanError("The end date must be after the first day of the plan")
    last = max(
        [end_day]
        + [
            day_number(add_months(h.plan.start, max(t.months for t in h.plan.tracks)))
            for h in homes
            if h is not None and h.plan.tracks
        ]
    )
    accounts = [o.account for o in (spec.x, spec.y)]
    if change.market_return is not None:
        grown = growing_asset(change.market_return, first, end_day)
        accounts = [None if a is None else replace(a, assets=[grown]) for a in accounts]
    elif change.historical:
        for account in accounts:
            if account is not None:
                _covers(account, first, end_day)
    cpi = cpi_path(spec.inflation, first, last, macro)
    if change.historical and spec.inflation.mode == "historical":
        published = int(cpi.days[-1])
        if end_day > published + MONTH_DAYS:
            raise PlanError(f"The CPI is published until {_date(published)}: end by then")
    warnings: list[str] = []
    sides: list[Side] = []
    for option, home, account in zip((spec.x, spec.y), homes, accounts, strict=True):
        series = None
        if home is not None:
            series, notes = home_series(home, cpi, macro, strict=change.historical)
            warnings.extend(notes)
        deposits = expand(
            [replace(d, day=add_months(d.day, change.shift)) for d in option.one_off],
            [replace(r, start=add_months(r.start, change.shift)) for r in option.recurring],
            cpi,
        )
        if account is not None and option.fill_seed is not None:
            rng = np.random.default_rng(option.fill_seed)
            account = replace(account, fill=replace(account.fill, rng=rng))  # noqa: PLW2901
        kept = [d for d in deposits if d.day < end]
        if len(kept) < len(deposits):
            warnings.append("Deposits on or after the day everything is sold are left out")
        sides.append(
            Side(
                home=None if home is None else home.plan,
                series=series,
                account=account,
                deposits=kept,
            )
        )
    return sides[0], sides[1], end, cpi, list(dict.fromkeys(warnings))


def run(spec: ScenarioSpec, macro: Macro, change: Change = Change()) -> PairResult:
    x, y, end, cpi, _ = build(spec, macro, change)
    return run_pair(x, y, end, cpi)


def difference(spec: ScenarioSpec, macro: Macro, change: Change) -> float:
    """The end value of X minus that of Y."""
    result = run(spec, macro, change)
    return result.x.wealth - result.y.wealth


def spending_gap(result: PairResult) -> float:
    """How much more both options spend than the larger of the two plans alone: zero when one
    option's spending covers the other's on every day."""
    planned = max(float(np.maximum(side.own, 0.0).sum()) for side in (result.x, result.y))
    return float(result.budget.sum()) - planned
