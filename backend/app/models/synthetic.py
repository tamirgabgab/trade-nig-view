"""Synthetic symbols: invented series served like market data (Phase K, ADR 0031).

A definition is stored in ``app.db`` and turned into bars on every request by
``app.data.synthetic``. Its symbol is ``SYN:`` plus a ticker-like name the user chooses, so it can
never shadow a real ticker (the Planner accepts any Yahoo ticker, not only the universe's).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.analysis.synthetic import Scenario
from app.models.symbols import SymbolInfo

PREFIX = "SYN:"
GROUP = "Synthetic"
MAX_DEFINITIONS = 100
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


class ScenarioDefinition(BaseModel):
    """A synthetic symbol drawn from one of the learn lab's scenarios (``app.analysis.synthetic``).

    The series has ``bars`` daily sessions, Monday to Friday from ``first_date`` (rolled forward
    to a weekday), and starts from ``first_price``; each session has seven 1h bars (09:30-16:00
    New York) whose aggregate is the daily bar.
    """

    model_config = ConfigDict(frozen=True)

    kind: Literal["scenario"] = "scenario"
    name: TickerName
    full_name: Annotated[str, Field(min_length=1, max_length=60)]
    scenario: Scenario
    seed: Annotated[int, Field(ge=0, le=1_000_000)]
    first_date: date
    first_price: Annotated[float, Field(gt=0, le=1_000_000)] = 100.0
    bars: Annotated[int, Field(ge=100, le=10_000)] = 2500
    currency: Literal["USD", "ILS"] = "ILS"

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

    @property
    def last_date(self) -> date:
        """The date of the last daily bar."""
        first = np.datetime64(self.first_date, "D")
        last = np.busday_offset(first, self.bars - 1, roll="forward")
        return date.fromisoformat(str(last))

    def info(self) -> SymbolInfo:
        """How the symbol shows in the API: its own group and exchange, US stock hours."""
        return SymbolInfo(
            symbol=self.symbol,
            display=self.symbol,
            name=self.full_name,
            type="synthetic",
            group=GROUP,
            exchange="Synthetic",
            currency=self.currency,
        )


def is_synthetic(info: SymbolInfo) -> bool:
    """The one test of whether a symbol is synthetic (not market data)."""
    return info.type == "synthetic"
