"""Loads what the market account needs: daily bars of any Yahoo ticker, the shekel rate, the
CPI, and fills from intraday bars when a deposit has a time of day.

* **Tickers.** A universe symbol is used as it is; any other ticker becomes an ad-hoc symbol in
  the currency the request states. A ``.TA`` ticker is a Tel Aviv one whatever the request says:
  shekels, Jerusalem time, the exchange's hours. Yahoo quotes Tel Aviv shares in agorot: the unit
  cancels between buying and selling.
* **USD/ILS.** Yahoo's market rate (``ILS=X``, daily closes); before its first bar, or when it
  cannot be loaded, the Bank of Israel's official rate. A bar's rate is the last one on or before
  its day.
* **A deposit with a time** is filled from the finest intraday bar that contains that instant
  (1m, then 5m, then 1h; the fill model runs inside that bar). Without such a bar, the time
  becomes a position inside the daily bar: the fraction of the exchange's cash session that has
  passed (0 before the open, 1 after the close). A deposit on a day without trading buys at the
  next bar's open.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal, Protocol
from zoneinfo import ZoneInfo

import numpy as np

from app.data.bar_service import BarService
from app.data.universe import Universe
from app.errors import DataUnavailableError
from app.macro.service import CachedSeries
from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, IntArray, Interval
from app.models.symbols import SymbolInfo, parse_session_start
from app.planner.deposits import Deposit, day_number
from app.planner.fills import fill_prices
from app.planner.inflation import HISTORICAL_FROM, CpiPath, assumed_cpi, historical_cpi
from app.planner.market import AssetData, FillSpec, PlanError

TICKER = re.compile(r"^[A-Za-z0-9.^=\-]{1,20}$")
USD_ILS = "ILS=X"
US_CASH_HOURS = "09:30-16:00"
#: Tel Aviv: approximate, from secondary sources (see ``config/universe.toml``).
TASE_HOURS = {"cash_hours": "09:59-17:14", "friday_hours": "10:00-14:00"}
INTRADAY_BASES = (Interval.MIN1, Interval.MIN5, Interval.H1)
DIVIDEND_TOLERANCE = 1e-9
FRIDAY = 4


class Macro(Protocol):
    """Where the macro series come from: ``MacroService``, or a copy kept for one request."""

    def get(self, series: str) -> CachedSeries: ...


class MacroMemo:
    """Each series loaded once: a study reads the same ones for hundreds of windows."""

    def __init__(self, macro: Macro) -> None:
        self._macro = macro
        self._loaded: dict[str, CachedSeries] = {}

    def get(self, series: str) -> CachedSeries:
        if series not in self._loaded:
            self._loaded[series] = self._macro.get(series)
        return self._loaded[series]


@dataclass(frozen=True, slots=True)
class InflationSpec:
    """Which index a plan uses: the assumed model's parameters, or the actual one."""

    mode: Literal["assumed", "historical"] = "assumed"
    mean: float = 0.025
    sd: float = 0.0
    persistence: float = 0.0
    #: Draw a path; None: the mean path.
    seed: int | None = None


def cpi_path(spec: InflationSpec, first_day: int, last_day: int, macro: Macro) -> CpiPath:
    """The plan's index over ``first_day .. last_day``."""
    if spec.mode == "historical":
        if first_day < HISTORICAL_FROM:
            raise PlanError("The historical CPI is used from 1994 on: start later or assume one")
        return historical_cpi(macro.get("cpi").data)
    rng = None if spec.seed is None else np.random.default_rng(spec.seed)
    return assumed_cpi(
        first_day, last_day, mu=spec.mean, sigma=spec.sd, phi=spec.persistence, rng=rng
    )


@dataclass(frozen=True, slots=True)
class AssetRequest:
    symbol: str
    weight: float = 1.0
    currency: str = "USD"
    dividend_yield: float = 0.0


@dataclass(frozen=True, slots=True)
class LoadedAsset:
    info: SymbolInfo
    data: AssetData
    has_dividends: bool


@dataclass(frozen=True, slots=True)
class FxSeries:
    days: IntArray
    values: FloatArray
    #: The first day served by Yahoo's market rate (None: the Bank of Israel all along).
    market_from: int | None
    warnings: tuple[str, ...] = ()

    def on(self, days: IntArray) -> FloatArray:
        """The rate of each day: the last one on or before it (NaN before the first)."""
        index = np.searchsorted(self.days, days, side="right") - 1
        return np.where(index >= 0, self.values[np.maximum(index, 0)], np.nan)


def asset_info(universe: Universe, request: AssetRequest) -> SymbolInfo:
    known = universe.resolve(request.symbol)
    if known is not None:
        return known
    symbol = request.symbol.strip().upper()
    if not TICKER.fullmatch(symbol):
        raise PlanError(f"'{request.symbol}' is not a ticker")
    info = SymbolInfo(
        symbol=symbol,
        display=symbol,
        name=symbol,
        type="stock",
        group="",
        exchange="",
        currency=request.currency,
    )
    if symbol.endswith(".TA"):
        return info.model_copy(
            update={"exchange": "TASE", "currency": "ILS", "timezone": "Asia/Jerusalem"}
            | TASE_HOURS
        )
    return info


def usd_ils(service: BarService, macro: Macro, universe: Universe) -> FxSeries:
    """Shekels per dollar by day: the BoI official rate, then Yahoo's market rate."""
    warnings: list[str] = []
    official = market = None
    try:
        official = macro.get("usd_ils_boi").data
    except DataUnavailableError as exc:
        warnings.append(f"Bank of Israel USD/ILS unavailable: {exc.detail}")
    try:
        info = asset_info(universe, AssetRequest(USD_ILS, currency="ILS"))
        market = service.daily(info).frame
    except DataUnavailableError as exc:
        warnings.append(f"Yahoo USD/ILS unavailable, the Bank of Israel rate is used: {exc.detail}")
    if market is None or len(market) == 0:
        if official is None:
            raise DataUnavailableError("No USD/ILS rate: " + "; ".join(warnings))
        return FxSeries(official.days, official.values, None, tuple(warnings))
    market_days = market.time // SECONDS_PER_DAY
    if official is None:
        return FxSeries(market_days, market.close, int(market_days[0]), tuple(warnings))
    before = official.days < market_days[0]
    return FxSeries(
        np.concatenate((official.days[before], market_days)),
        np.concatenate((official.values[before], market.close)),
        int(market_days[0]),
        tuple(warnings),
    )


def load_asset(
    service: BarService, universe: Universe, request: AssetRequest, fx: FxSeries | None
) -> LoadedAsset:
    """The asset's whole daily history (unadjusted prices and the dividend factor)."""
    info = asset_info(universe, request)
    frame = service.daily(info).frame
    if len(frame) == 0:
        raise DataUnavailableError(f"No daily bars for {info.symbol}")
    days = frame.time // SECONDS_PER_DAY
    factor = frame.adj_close / frame.close
    if fx is None or info.currency == "ILS":
        rate = np.ones(len(days))
    elif info.currency == "USD":
        rate = fx.on(days)
    else:
        raise PlanError(
            f"{info.symbol} is priced in {info.currency}: only USD and ILS are supported"
        )
    data = AssetData(
        info.symbol,
        request.weight,
        days,
        frame.open,
        frame.high,
        frame.low,
        frame.close,
        factor,
        rate,
        request.dividend_yield,
    )
    return LoadedAsset(info, data, bool(np.ptp(factor) > DIVIDEND_TOLERANCE))


def session_fraction(info: SymbolInfo, bar_day: date, instant: datetime) -> float:
    """Where ``instant`` falls in the exchange's cash session of ``bar_day``, the day of the bar
    the purchase lands on (0 .. 1; NaN for markets without a cash session: futures, forex).

    An instant before that day (a weekend or holiday deposit, or an evening before the session)
    is 0: the purchase waits for the open.
    """
    if info.session_start is not None:
        return float("nan")
    local = instant.astimezone(ZoneInfo(info.timezone))
    if local.date() != bar_day:
        return 0.0 if local.date() < bar_day else 1.0
    friday = info.friday_hours if bar_day.weekday() == FRIDAY else None
    start, _, end = (friday or info.cash_hours or US_CASH_HOURS).partition("-")
    opened, closed = parse_session_start(start), parse_session_start(end)
    minutes = local.hour * 60 + local.minute + local.second / 60
    return float(np.clip((minutes - opened) / (closed - opened), 0.0, 1.0))


def timed_fills(
    service: BarService,
    assets: Sequence[LoadedAsset],
    deposits: Sequence[Deposit],
    timezone: str,
    fill: FillSpec,
) -> tuple[FloatArray, FloatArray]:
    """``(session_t, fill_override)`` for ``run_market``: NaN where a deposit has no time."""
    session_t = np.full((len(deposits), len(assets)), np.nan)
    override = np.full((len(deposits), len(assets)), np.nan)
    timed = [(j, d) for j, d in enumerate(deposits) if d.at is not None]
    if not timed:
        return session_t, override
    zone = ZoneInfo(timezone)
    for a, asset in enumerate(assets):
        frames: list[tuple[Interval, BarFrame]] = []
        for base in INTRADAY_BASES:
            try:
                frames.append((base, service.history(asset.info, base).frame))
            except DataUnavailableError:
                continue
        for j, deposit in timed:
            assert deposit.at is not None  # noqa: S101 - filtered above
            instant = datetime.combine(deposit.day, deposit.at, zone)
            days = asset.data.days
            bar = int(np.searchsorted(days, day_number(deposit.day), side="left"))
            if bar >= len(days):
                continue  # no bar to buy on: run_market reports it
            bar_day = date(1970, 1, 1) + timedelta(days=int(days[bar]))
            session_t[j, a] = session_fraction(asset.info, bar_day, instant)
            stamp = instant.timestamp()
            for base, frame in frames:
                k = int(np.searchsorted(frame.time, stamp, side="right")) - 1
                if k >= 0 and stamp < frame.time[k] + base.seconds:
                    bar = (frame.open[k : k + 1], frame.high[k : k + 1], frame.low[k : k + 1])
                    at = np.array([(stamp - frame.time[k]) / base.seconds])
                    override[j, a] = fill_prices(
                        *bar, frame.close[k : k + 1], fill.mode, t=at, granularity=fill.granularity
                    )[0]
                    break
    return session_t, override


def first_day(asset: LoadedAsset) -> date:
    return date(1970, 1, 1) + timedelta(days=int(asset.data.days[0]))


def last_day(asset: LoadedAsset) -> date:
    return date(1970, 1, 1) + timedelta(days=int(asset.data.days[-1]))
