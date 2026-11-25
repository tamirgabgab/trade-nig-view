"""Layout document (ARCHITECTURE §5.3): a named, saved chart setup.

The symbol, the indicator ids, their params and style keys are checked against the universe and
the indicator catalog by the endpoint (``app.api.layouts``); these models check the shape.
"""

from __future__ import annotations

import unicodedata
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.models.bars import Interval
from app.models.drawings import HexColor

SCHEMA_VERSION = 1
MAX_INDICATORS = 20


def _plain_name(value: str) -> str:
    if "/" in value or any(unicodedata.category(ch) == "Cc" for ch in value):
        raise ValueError("a name cannot contain '/' or control characters")
    if set(value) == {"."}:
        raise ValueError("a name cannot be only dots (a URL path step)")
    return value


#: Name of a saved layout or watchlist (also its URL path segment).
DocumentName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=60),
    AfterValidator(_plain_name),
]

ChartType = Literal["candles", "hollow", "bars", "line", "area", "heikin_ashi"]
ScaleMode = Literal["normal", "log", "percent"]


class LayoutStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    color: HexColor
    line_width: int = Field(ge=1, le=4)


class LayoutIndicator(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uid: str = Field(min_length=1, max_length=40, description="Client id of this instance")
    id: str = Field(description="Indicator id from GET /api/indicators")
    params: dict[str, bool | int | float | str] = Field(
        default_factory=dict[str, bool | int | float | str],
        description="Params that differ from the defaults (validated like /api/indicators)",
    )
    styles: dict[str, LayoutStyle] = Field(
        default_factory=dict[str, LayoutStyle], description="Style per output name"
    )
    visible: bool = True
    pane_stretch: float | None = Field(default=None, gt=0, le=100)


#: Symbols a chart compares with at most.
MAX_COMPARE = 3


class VisibleRange(BaseModel):
    """Visible bar times, in the ``/api/bars`` format (``YYYY-MM-DD`` or UTC epoch seconds)."""

    model_config = ConfigDict(extra="forbid")

    from_: str | int = Field(alias="from")
    to: str | int


class LayoutBody(BaseModel):
    """Fields shared by the stored document and the ``PUT`` body."""

    model_config = ConfigDict(extra="forbid")

    symbol: str
    interval: Interval
    chart_type: ChartType
    scale_mode: ScaleMode
    auto_scale: bool = True
    adjusted: bool = True
    indicators: list[LayoutIndicator] = Field(
        default_factory=list[LayoutIndicator], max_length=MAX_INDICATORS
    )
    visible_range: VisibleRange | None = None
    compare: list[str] = Field(
        default_factory=list[str],
        max_length=MAX_COMPARE,
        description="Symbols drawn as % lines over the chart (Compare)",
    )

    @field_validator("indicators")
    @classmethod
    def _unique_uids(cls, indicators: list[LayoutIndicator]) -> list[LayoutIndicator]:
        uids = [i.uid for i in indicators]
        if len(set(uids)) != len(uids):
            raise ValueError("indicator uids must be unique")
        return indicators


class LayoutUpdate(LayoutBody):
    """``PUT`` body: the whole layout, and the revision it was based on (optimistic locking)."""

    revision: int = Field(ge=0, description="Revision the client last read; 0 = create")


class LayoutDocument(LayoutBody):
    schema_version: int = SCHEMA_VERSION
    name: str
    revision: int = Field(ge=1, description="Bumped by every save")
    updated_at: str = Field(description="UTC ISO time of the last save")


class LayoutSummary(BaseModel):
    name: str
    revision: int
    updated_at: str
    symbol: str
    interval: Interval


class LayoutList(BaseModel):
    layouts: list[LayoutSummary] = Field(description="Newest first")
