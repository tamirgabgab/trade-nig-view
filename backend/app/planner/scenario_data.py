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
* **world**: the realization is a simulated world (``app.planner.paths``), on the plan's own
  dates. The world's assets replace each mix (a modelled market replaces all of them), its CPI
  is the plan's, and each apartment takes from it what its tab marks as historical: the dwelling
  index and the Bank of Israel rate. A value marked as assumed is drawn from the apartment's own
  mean and volatility with the world's shocks. The linear rule is off and the rates follow, as
  in a window: here by the world's rate on the purchase day minus the last published one.
* **appreciation**, **market_return**, **rate_shift**, **rent_scale**: one input replaced, for the
  breakeven rates: every apartment's value grows by a constant yearly rate; every account holds
  one asset growing by a constant yearly rate in shekels; every track's rate (a prime track's
  spread) moves by a constant; every rent is multiplied.
* **value_drift**, **market_drift**, **tax_shift**: one input *moved*, for the sensitivity. The
  path in use (historical, assumed or a world's) is kept and tilted: every apartment's value is
  multiplied by :math:`(1 + d)^{k/12}` in month :math:`k` (a rent that follows the value follows
  it), every asset's price by :math:`(1 + d)^{\\text{days}/365.25}` from the first day; the
  capital-gains tax rate of every account and the betterment tax rate of every apartment move
  by a constant, held inside 0 to 100 %. A move of nothing is the plan itself.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import date, timedelta

import numpy as np

from app.models.bars import FloatArray, IntArray
from app.planner.data import InflationSpec, Macro, cpi_path
from app.planner.deposits import EPOCH, Deposit, Recurring, add_months, day_number, expand
from app.planner.explain import Correlation, yearly_correlation
from app.planner.home import HomeSeries, RentMode
from app.planner.home_data import MONTH_DAYS, HomeSpec, dwelling_index, home_series, month_days
from app.planner.inflation import CpiPath, historical_cpi, month_starts
from app.planner.market import DAYS_PER_YEAR, MAX_STALE_DAYS, AssetData, PlanError
from app.planner.mortgage import RateKind
from app.planner.paths import Panel, World, WorldSpec, estimate, lognormal, monthly
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
    world: World | None = None
    appreciation: float | None = None
    market_return: float | None = None
    rate_shift: float = 0.0
    rent_scale: float = 1.0
    value_drift: float = 0.0
    market_drift: float = 0.0
    tax_shift: float = 0.0


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


def _world_rate(world: World, days: IntArray) -> FloatArray | None:
    """The world's Bank of Israel rate on ``days`` (held at its last month beyond them)."""
    if world.rate is None:
        return None
    month = np.searchsorted(world.days, days, side="right") - 1
    return world.rate[np.clip(month, 0, len(world.rate) - 1)]


def _moved_home(spec: HomeSpec, change: Change, delta: int, macro: Macro) -> HomeSpec:
    plan = spec.plan
    months = plan.months + delta
    if months < 1:
        raise PlanError("The apartment must be held for at least a month")
    start = add_months(plan.start, change.shift)
    follow = 0.0
    world = change.world
    if change.follow_rates and spec.rates_mode == "historical":
        if world is not None and world.rate_now is not None:
            rate = _world_rate(world, np.array([day_number(start)]))
            follow = 0.0 if rate is None else float(rate[0]) - world.rate_now
        elif change.historical:
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
    if change.historical or world is not None:
        plan = replace(plan, betterment=replace(plan.betterment, linear=False))
    if change.tax_shift:
        rate = _rate(plan.betterment.rate + change.tax_shift)
        plan = replace(plan, betterment=replace(plan.betterment, rate=rate))
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


def _rate(value: float) -> float:
    """A tax rate held inside 0 to 100 %."""
    return min(max(value, 0.0), 1.0)


def _moved_account(account: Account, change: Change, first: int) -> Account:
    """The account with its prices tilted from day ``first`` and its gains tax moved."""
    assets = list(account.assets)
    if change.market_drift:
        tilts = [(1.0 + change.market_drift) ** ((a.days - first) / DAYS_PER_YEAR) for a in assets]
        assets = [
            replace(a, open=a.open * t, high=a.high * t, low=a.low * t, close=a.close * t)
            for a, t in zip(assets, tilts, strict=True)
        ]
    taxes = replace(account.taxes, gains=_rate(account.taxes.gains + change.tax_shift))
    return replace(account, assets=assets, taxes=taxes)


def asset_key(asset: AssetData) -> str:
    """An asset's name in a history panel: its symbol, marked when a shekel rate applies."""
    return asset.symbol if np.all(asset.fx == 1.0) else f"{asset.symbol}:fx"


def _world_account(account: Account, world: World) -> Account:
    """The account in a world: the modelled market, or each asset's simulated bars."""
    if world.market is not None:
        return replace(account, assets=[world.market])
    assets = [
        replace(world.assets[asset_key(a)], weight=a.weight, dividend_yield=a.dividend_yield)
        for a in account.assets
    ]
    return replace(account, assets=assets)


def _world_series(
    home: HomeSpec, world: World, number: int
) -> tuple[FloatArray, FloatArray | None]:
    """An apartment's value index and anchor rate in a world (``number``: 0 for x, 1 for y)."""
    plan = home.plan
    held = plan.months
    days = month_days(plan.start, max([held, *(t.months for t in plan.tracks)]))
    if home.value_mode == "historical":
        levels = world.dwellings[home.value_series]
        value = np.exp(np.interp(days[: held + 1], world.days, np.log(levels)))
    else:
        first = EPOCH + timedelta(days=int(world.days[0]))
        offset = (plan.start.year - first.year) * 12 + plan.start.month - first.month
        rho = world.correlation
        shocks = (
            rho * world.market_shocks[offset : offset + held]
            + np.sqrt(1.0 - rho * rho) * world.home_shocks[number, :held]
        )
        value = lognormal(home.value_mean, home.value_sd, shocks)
    anchor = _world_rate(world, days) if home.rates_mode == "historical" else None
    return value, anchor


def _changed_accounts(
    spec: ScenarioSpec, change: Change, first: int, end_day: int
) -> list[Account | None]:
    """Each option's account under a change: a world's assets, one asset of a constant return,
    or its own (checked to cover a window of history), then tilted and re-taxed."""
    accounts = [o.account for o in (spec.x, spec.y)]
    if change.world is not None:
        accounts = [None if a is None else _world_account(a, change.world) for a in accounts]
    elif change.market_return is not None:
        grown = growing_asset(change.market_return, first, end_day)
        accounts = [None if a is None else replace(a, assets=[grown]) for a in accounts]
    elif change.historical:
        for account in accounts:
            if account is not None:
                _covers(account, first, end_day)
    if change.market_drift or change.tax_shift:
        accounts = [None if a is None else _moved_account(a, change, first) for a in accounts]
    return accounts


def _series(
    home: HomeSpec, cpi: CpiPath, macro: Macro, change: Change, number: int
) -> tuple[HomeSeries, list[str]]:
    """An apartment's monthly series under a change: from a world when there is one, and with
    its value tilted by ``value_drift``."""
    world = change.world
    value, anchor = (None, None) if world is None else _world_series(home, world, number)
    if change.value_drift:
        if value is None:
            value = home_series(home, cpi, macro, strict=change.historical)[0].value
        value = value * (1.0 + change.value_drift) ** (np.arange(len(value)) / 12.0)
    return home_series(home, cpi, macro, strict=change.historical, value=value, anchor=anchor)


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
    world = change.world
    accounts = _changed_accounts(spec, change, first, end_day)
    cpi = world.cpi if world is not None else cpi_path(spec.inflation, first, last, macro)
    if change.historical and spec.inflation.mode == "historical":
        published = int(cpi.days[-1])
        if end_day > published + MONTH_DAYS:
            raise PlanError(f"The CPI is published until {_date(published)}: end by then")
    warnings: list[str] = []
    sides: list[Side] = []
    for number, (option, home, account) in enumerate(
        zip((spec.x, spec.y), homes, accounts, strict=True)
    ):
        series = None
        if home is not None:
            series, notes = _series(home, cpi, macro, change, number)
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


#: Fewer shared months than this are too few to resample.
MIN_HISTORY = 24


def _accounts(spec: ScenarioSpec) -> list[Account]:
    return [o.account for o in (spec.x, spec.y) if o.account is not None]


def _panel(
    series: dict[str, tuple[IntArray, FloatArray]],
) -> tuple[IntArray, dict[str, FloatArray]]:
    """The month starts every series covers, and each series' growth over those months."""
    first = max(int(days[0]) for days, _ in series.values())
    last = min(int(days[-1]) for days, _ in series.values())
    months = month_starts(first, max(first, last))
    months = months[(months >= first) & (months <= last)]
    if len(months) - 1 < MIN_HISTORY:
        raise PlanError(
            f"The series share {max(len(months) - 1, 0)} months of history ({_date(first)} to "
            f"{_date(last)}): too few to resample"
        )
    levels = {name: monthly(days, values, months) for name, (days, values) in series.items()}
    return months, {name: v[1:] / v[:-1] for name, v in levels.items()}


def _asset_series(asset: AssetData) -> dict[str, tuple[IntArray, FloatArray]]:
    """The three series an asset is resampled as, from its first bar with a shekel rate."""
    key = asset_key(asset)
    known = np.isfinite(asset.fx)
    return {
        f"{key}/close": (asset.days[known], asset.close[known]),
        f"{key}/factor": (asset.days[known], asset.factor[known]),
        f"{key}/fx": (asset.days[known], asset.fx[known]),
    }


def history_panel(spec: ScenarioSpec, macro: Macro, *, assets: bool) -> Panel | None:
    """The monthly history a simulation resamples: the accounts' assets (unless the market is
    modelled) and whatever the scenario marks as historical: the CPI, each apartment's dwelling
    index, the Bank of Israel rate. None when nothing is resampled."""
    series: dict[str, tuple[IntArray, FloatArray]] = {}
    if assets:
        for account in _accounts(spec):
            for asset in account.assets:
                series.update(_asset_series(asset))
    if spec.inflation.mode == "historical":
        cpi = historical_cpi(macro.get("cpi").data)
        series["cpi"] = (cpi.days, cpi.values)
    homes = _homes(spec)
    for home in homes:
        if home.value_mode == "historical":
            index = dwelling_index(macro, home.value_series)
            series[home.value_series] = (index.days, index.values)
    rates = any(h.rates_mode == "historical" for h in homes)
    if rates:
        boi = macro.get("boi_rate").data
        series["rate"] = (boi.days, boi.values / 100.0)
    if not series:
        return None
    months, ratios = _panel(series)
    rate = monthly(*series["rate"], months)[:-1] if rates else None
    ratios.pop("rate", None)
    return Panel(months, ratios, rate)


def _mix_growth(mix: Sequence[AssetData], ratios: dict[str, FloatArray]) -> FloatArray:
    """The monthly growth of a mix in shekels, dividends in, its weights restored monthly."""
    total = sum(a.weight for a in mix)
    growth = sum(
        a.weight
        / total
        * ratios[f"{asset_key(a)}/close"]
        * ratios[f"{asset_key(a)}/factor"]
        * ratios[f"{asset_key(a)}/fx"]
        * (1.0 + a.dividend_yield) ** (1.0 / 12.0)
        for a in mix
    )
    return np.asarray(growth)


def estimate_market(spec: ScenarioSpec) -> tuple[float, float]:
    """The yearly mean growth and volatility, in shekels and with dividends (those in the
    prices, and a price-only asset's assumed yield), of the first account's mix over its
    assets' shared history (the weights restored every month)."""
    accounts = _accounts(spec)
    if not accounts:
        raise PlanError("A modelled market needs an asset mix to stand for")
    mix = accounts[0].assets
    series: dict[str, tuple[IntArray, FloatArray]] = {}
    for asset in mix:
        series.update(_asset_series(asset))
    _, ratios = _panel(series)
    return estimate(_mix_growth(mix, ratios))


def world_spec(
    spec: ScenarioSpec,
    macro: Macro,
    *,
    market: tuple[float, float] | None = None,
    seed: int = 1,
    block: int = 12,
    correlation: float = 0.0,
) -> WorldSpec:
    """What the worlds of a simulation of ``spec`` are made of. ``market``: a modelled market
    (yearly mean growth, volatility) instead of the accounts' resampled assets."""
    homes = _homes(spec)
    first = first_day(spec)
    end = add_months(homes[0].plan.start, homes[0].plan.months) if homes else spec.end
    months = (end.year - first.year) * 12 + end.month - first.month
    months += add_months(first, months) < end
    rates = any(h.rates_mode == "historical" for h in homes)
    return WorldSpec(
        first=day_number(first),
        months=max(months, 1),
        seed=seed,
        block=block,
        panel=history_panel(spec, macro, assets=market is None),
        assets={}
        if market is not None
        else {asset_key(a): a for account in _accounts(spec) for a in account.assets},
        market=market,
        inflation=spec.inflation,
        dwellings=sorted({h.value_series for h in homes if h.value_mode == "historical"}),
        rate_now=float(macro.get("boi_rate").data.values[-1]) / 100.0 if rates else None,
        correlation=correlation,
    )


def dwelling_correlation(spec: ScenarioSpec, macro: Macro) -> Correlation | None:
    """The correlation of the yearly returns of the dwelling price index (the first apartment's
    own when it follows one, the national one otherwise) and the first account's mix in
    shekels, over the history they share. None without both, or without enough of it."""
    homes, accounts = _homes(spec), _accounts(spec)
    if not homes or not accounts:
        return None
    name = homes[0].value_series if homes[0].value_mode == "historical" else "dwelling"
    index = dwelling_index(macro, name)
    mix = accounts[0].assets
    series: dict[str, tuple[IntArray, FloatArray]] = {name: (index.days, index.values)}
    for asset in mix:
        series.update(_asset_series(asset))
    try:
        _, ratios = _panel(series)
    except PlanError:
        return None
    return yearly_correlation(ratios[name], _mix_growth(mix, ratios))


@dataclass(frozen=True, slots=True)
class Move:
    """One input moved by ``step`` each way: the change of x's end value minus y's (None: the
    plan cannot run with the move)."""

    input: str
    step: float
    down: float | None
    up: float | None


#: The inputs of the sensitivity with their steps: points of a rate, or a share of the rent.
STEPS = {
    "appreciation": 0.01,
    "mortgage_rates": 0.01,
    "rent": 0.10,
    "market_return": 0.01,
    "taxes": 0.05,
}


def _moved(name: str, step: float) -> Change:
    return {
        "appreciation": Change(value_drift=step),
        "mortgage_rates": Change(rate_shift=step),
        "rent": Change(rent_scale=1.0 + step),
        "market_return": Change(market_drift=step),
        "taxes": Change(tax_shift=step),
    }[name]


def sensitivity(spec: ScenarioSpec, macro: Macro) -> list[Move]:
    """Each input the scenario has, moved down and up by its step, everything else as entered."""
    homes = [h.plan for h in _homes(spec)]
    has = {
        "appreciation": bool(homes),
        "mortgage_rates": any(h.tracks for h in homes),
        "rent": any(h.rent_mode is not RentMode.NONE and h.rent > 0 for h in homes),
        "market_return": bool(_accounts(spec)),
        "taxes": True,
    }
    base = difference(spec, macro, Change())

    def moved(name: str, step: float) -> float | None:
        try:
            return difference(spec, macro, _moved(name, step)) - base
        except PlanError:
            return None

    return [
        Move(name, step, moved(name, -step), moved(name, step))
        for name, step in STEPS.items()
        if has[name]
    ]
