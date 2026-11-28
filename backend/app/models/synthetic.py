"""Synthetic symbols: invented series served like market data (Phase K, ADR 0031).

A definition (a lab scenario, K0, a dwelling price index, K1, the user's statistics, K2, or a
shuffled copy of a market symbol, K3) is stored in ``app.db`` and turned into bars by
``app.data.synthetic`` (``app.data.synthetic_shuffle`` for a copy). Its symbol is ``SYN:`` plus
a ticker-like name the user chooses, so it can never shadow a real ticker (the Planner accepts any
Yahoo ticker, not only the universe's).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Self, cast

import numpy as np
from pydantic import (
    BaseModel,
    ConfigDict,
    Discriminator,
    Field,
    Tag,
    TypeAdapter,
    field_validator,
    model_validator,
)

from app.analysis.synthetic import Scenario
from app.models.symbols import SymbolInfo

PREFIX = "SYN:"
GROUP = "Synthetic"
MAX_DEFINITIONS = 100
#: Bars are day numbers since 1970-01-01, as the bar service keeps them.
FIRST_DAY = date(1970, 1, 1)
#: The ticker-like part after the prefix: a letter, then letters, digits, ``.``, ``-`` or ``_``.
NAME_PATTERN = r"^[A-Z][A-Z0-9._\-]{0,11}$"

TickerName = Annotated[
    str,
    Field(
        pattern=NAME_PATTERN,
        description="The part after 'SYN:': 1-12 of A-Z, 0-9, '.', '-', '_', starting with a"
        " letter (upper-cased on input)",
    ),
]


class _Definition(BaseModel):
    """What every kind of synthetic symbol has: a name and a full name."""

    model_config = ConfigDict(frozen=True)

    name: TickerName
    full_name: Annotated[str, Field(min_length=1, max_length=60)]

    @field_validator("name", mode="before")
    @classmethod
    def _upper(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("full_name")
    @classmethod
    def _trimmed(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("full_name must not be blank")
        return value

    @property
    def symbol(self) -> str:
        return PREFIX + self.name

    def _info(self, currency: str, has_volume: bool, decimals: int = 2) -> SymbolInfo:
        """How the symbol shows in the API: its own group and exchange, US stock hours."""
        return SymbolInfo(
            symbol=self.symbol,
            display=self.symbol,
            name=self.full_name,
            type="synthetic",
            group=GROUP,
            exchange="Synthetic",
            currency=currency,
            has_volume=has_volume,
            decimals=decimals,
        )


class _Priced(BaseModel):
    """The user's first price (every kind but a shuffled copy, which starts at its source's)."""

    model_config = ConfigDict(frozen=True)

    first_price: Annotated[float, Field(gt=0, le=1_000_000)] = 100.0


class _Dated(BaseModel):
    """``bars`` weekdays from ``first_date`` (rolled forward), priced in ``currency``."""

    model_config = ConfigDict(frozen=True)

    first_date: Annotated[date, Field(ge=FIRST_DAY, description="From 1970-01-01")]
    bars: Annotated[int, Field(ge=100, le=10_000)] = 2500
    currency: Literal["USD", "ILS"] = "ILS"

    @property
    def last_date(self) -> date:
        """The date of the last daily bar."""
        first = np.datetime64(self.first_date, "D")
        last = np.busday_offset(first, self.bars - 1, roll="forward")
        return date.fromisoformat(str(last))


class ScenarioDefinition(_Definition, _Priced, _Dated):
    """A synthetic symbol drawn from one of the learn lab's scenarios (``app.analysis.synthetic``).

    The series has ``bars`` daily sessions, Monday to Friday from ``first_date`` (rolled forward
    to a weekday), and starts from ``first_price``; each session has seven 1h bars (09:30-16:00
    New York) whose aggregate is the daily bar.
    """

    kind: Literal["scenario"] = "scenario"
    scenario: Scenario
    seed: Annotated[int, Field(ge=0, le=1_000_000)]

    def info(self) -> SymbolInfo:
        return self._info(self.currency, has_volume=True)


DwellingSeries = Literal[
    "dwelling",
    "dwelling_telaviv",
    "dwelling_center",
    "dwelling_haifa",
    "dwelling_jerusalem",
    "dwelling_north",
    "dwelling_south",
]


class DwellingDefinition(_Definition, _Priced):
    """A synthetic symbol whose close is a CBS dwelling price index (``app.macro``, K1).

    The index's first value is ``first_price``; ``noise_pct`` is the daily standard deviation of
    a bridge that returns to the index on every anchor date. Interpolated (the default), the
    anchors are the index's month dates and the close runs geometrically between them, which
    uses the next month's value (not causal). Causal, every value holds from its assumed
    publication, ``lag_months`` after its month date. Prices in shekels, no volume.
    """

    kind: Literal["dwelling"] = "dwelling"
    series: DwellingSeries = "dwelling"
    seed: Annotated[int, Field(ge=0, le=1_000_000)]
    noise_pct: Annotated[float, Field(ge=0, le=5, description="Daily standard deviation, %")] = 0.2
    causal: bool = False
    lag_months: Annotated[int, Field(ge=0, le=12, description="Causal only: publication lag")] = 2

    def info(self) -> SymbolInfo:
        return self._info("ILS", has_volume=False)


#: A synthetic calendar's year: the weekdays in an average calendar year (365.25 x 5 / 7), so the
#: app's own yearly figures (volatility, XIRR) give back the mean and volatility that were set.
YEAR_BARS = 365.25 * 5 / 7

Distribution = Literal["normal", "student_t", "uniform", "laplace", "skew_normal"]


class ReturnShape(BaseModel):
    """The daily return of a parametric symbol (K2): a family of shocks scaled to the yearly mean
    and volatility, and three layers on top (memory, jumps, volatility clustering).

    ``mean_pct`` is the expected simple yearly return mu (E[P_1/P_0] = 1 + mu); ``vol_pct`` the
    daily standard deviation annualised, sigma (with memory, the standard deviation of a year's
    summed returns). ``exact`` shifts and scales the drawn returns
    so the path's own mean and standard deviation are the targets.
    """

    model_config = ConfigDict(frozen=True)

    mean_pct: Annotated[
        float, Field(ge=-50, le=100, description="Expected simple yearly return, %")
    ] = 7.0
    vol_pct: Annotated[float, Field(ge=1, le=100, description="Yearly volatility, %")] = 18.0
    distribution: Distribution = "normal"
    df: Annotated[float, Field(gt=2, le=100, description="Student-t degrees of freedom")] = 5.0
    skew: Annotated[float, Field(ge=-20, le=20, description="Skew-normal shape alpha")] = -4.0
    exact: bool = False
    memory: Annotated[float, Field(ge=-0.9, le=0.9, description="AR(1) coefficient phi")] = 0.0
    jumps_per_year: Annotated[float, Field(ge=0, le=50)] = 0.0
    jump_mean_pct: Annotated[float, Field(ge=-50, le=50, description="Mean jump, %")] = -5.0
    jump_sd_pct: Annotated[float, Field(ge=0, le=50, description="Jump standard deviation, %")] = (
        5.0
    )
    garch_alpha: Annotated[float, Field(ge=0, le=0.5, description="GARCH(1,1) alpha")] = 0.0
    garch_beta: Annotated[float, Field(ge=0, le=0.99, description="GARCH(1,1) beta")] = 0.0

    @property
    def jump_variance(self) -> float:
        """The variance the jumps add over a year: lambda (mu_J^2 + sigma_J^2)."""
        return self.jumps_per_year * (
            (self.jump_mean_pct / 100) ** 2 + (self.jump_sd_pct / 100) ** 2
        )

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if self.garch_alpha + self.garch_beta >= 1:
            raise ValueError(
                "garch_alpha + garch_beta must be below 1 (a finite long-run variance)"
            )
        if self.jump_variance >= (self.vol_pct / 100) ** 2:
            raise ValueError(
                "The jumps carry all of sigma's variance or more: fewer or smaller jumps, or a"
                " larger sigma"
            )
        return self


class ParametricDefinition(_Definition, _Priced, _Dated, ReturnShape):
    """A synthetic symbol whose daily returns are drawn from the user's statistics (K2)."""

    kind: Literal["parametric"] = "parametric"
    seed: Annotated[int, Field(ge=0, le=1_000_000)]

    def info(self) -> SymbolInfo:
        return self._info(self.currency, has_volume=True)


class ShuffleDefinition(_Definition):
    """A copy of a market symbol's daily bars in ``[start, end]`` with its blocks of
    ``block_days`` bars put in another order (K3, ``app.data.synthetic_shuffle``).

    Each bar after the first is kept as its ratios to the previous close, so the copy has the
    source's dates, first bar, total return and set of daily bars; only their order changes.
    Prices are dividend-adjusted (the source's adjustment sets the level). ``currency``,
    ``has_volume`` and ``decimals`` are the source's, set by the API when it is saved.
    """

    kind: Literal["shuffle"] = "shuffle"
    source: Annotated[str, Field(min_length=1, max_length=20, description="A market symbol")]
    start: Annotated[date, Field(ge=FIRST_DAY, description="The first bar's date, from 1970")]
    end: Annotated[date, Field(description="The last bar's date (inclusive), before today")]
    block_days: Annotated[int, Field(ge=1, le=1000, description="Bars in a block")] = 21
    seed: Annotated[int, Field(ge=0, le=1_000_000)]
    currency: Annotated[str, Field(description="The source's, set when saved")] = "USD"
    has_volume: Annotated[bool, Field(description="The source's, set when saved")] = True
    decimals: Annotated[int, Field(ge=0, le=8, description="The source's, set when saved")] = 2

    @field_validator("source", mode="before")
    @classmethod
    def _source_upper(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _range(self) -> Self:
        if self.source.startswith(PREFIX):
            raise ValueError("The source must be a market symbol, not a synthetic one")
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self

    @property
    def last_date(self) -> date:
        return self.end

    def info(self) -> SymbolInfo:
        return self._info(self.currency, self.has_volume, self.decimals)


def _kind(value: object) -> str:
    """The definition's kind; a body without one is a lab scenario (K0's API had no ``kind``)."""
    if isinstance(value, dict):
        return str(cast("dict[str, object]", value).get("kind", "scenario"))
    return str(getattr(value, "kind", "scenario"))


SyntheticDefinition = Annotated[
    Annotated[ScenarioDefinition, Tag("scenario")]
    | Annotated[DwellingDefinition, Tag("dwelling")]
    | Annotated[ParametricDefinition, Tag("parametric")]
    | Annotated[ShuffleDefinition, Tag("shuffle")],
    Discriminator(_kind),
]
#: Parses a stored or sent definition of any kind.
DEFINITION: TypeAdapter[
    ScenarioDefinition | DwellingDefinition | ParametricDefinition | ShuffleDefinition
] = TypeAdapter(SyntheticDefinition)


def is_synthetic(info: SymbolInfo) -> bool:
    """The one test of whether a symbol is synthetic (not market data)."""
    return info.type == "synthetic"
