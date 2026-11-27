"""Synthetic symbols: invented series served like market data (Phase K, ADR 0031).

A definition (a lab scenario, K0, or a dwelling price index, K1) is stored in ``app.db`` and turned
into bars by ``app.data.synthetic``. Its symbol is ``SYN:`` plus a ticker-like name the user
chooses, so it can never shadow a real ticker (the Planner accepts any Yahoo ticker, not only the
universe's).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator

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
    """What every kind of synthetic symbol has: a name, a full name, a first price."""

    model_config = ConfigDict(frozen=True)

    name: TickerName
    full_name: Annotated[str, Field(min_length=1, max_length=60)]
    first_price: Annotated[float, Field(gt=0, le=1_000_000)] = 100.0

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

    def _info(self, currency: str, has_volume: bool) -> SymbolInfo:
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
        )


class ScenarioDefinition(_Definition):
    """A synthetic symbol drawn from one of the learn lab's scenarios (``app.analysis.synthetic``).

    The series has ``bars`` daily sessions, Monday to Friday from ``first_date`` (rolled forward
    to a weekday), and starts from ``first_price``; each session has seven 1h bars (09:30-16:00
    New York) whose aggregate is the daily bar.
    """

    kind: Literal["scenario"] = "scenario"
    scenario: Scenario
    seed: Annotated[int, Field(ge=0, le=1_000_000)]
    first_date: Annotated[date, Field(ge=FIRST_DAY, description="From 1970-01-01")]
    bars: Annotated[int, Field(ge=100, le=10_000)] = 2500
    currency: Literal["USD", "ILS"] = "ILS"

    @property
    def last_date(self) -> date:
        """The date of the last daily bar."""
        first = np.datetime64(self.first_date, "D")
        last = np.busday_offset(first, self.bars - 1, roll="forward")
        return date.fromisoformat(str(last))

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


class DwellingDefinition(_Definition):
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


SyntheticDefinition = Annotated[
    ScenarioDefinition | DwellingDefinition, Field(discriminator="kind")
]
#: Parses a stored or sent definition of any kind.
DEFINITION: TypeAdapter[ScenarioDefinition | DwellingDefinition] = TypeAdapter(SyntheticDefinition)


def is_synthetic(info: SymbolInfo) -> bool:
    """The one test of whether a symbol is synthetic (not market data)."""
    return info.type == "synthetic"
