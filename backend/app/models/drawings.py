"""Drawings document (ARCHITECTURE §5.2): data-anchored chart drawings, one document per symbol.

Anchors are in data space, never pixels: ``time`` is the UTC epoch second of the anchor bar's open
(the frontend maps it onto any interval), ``price`` is the price.
"""

from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = 1
MAX_DRAWINGS = 500

DrawingType = Literal[
    "trend_line",
    "ray",
    "extended_line",
    "horizontal_line",
    "horizontal_ray",
    "vertical_line",
    "rectangle",
    "text",
    "fib_retracement",
    "fib_extension",
    "parallel_channel",
    "price_range",
    "date_range",
    "date_price_range",
    "return_range",
    "stats_range",
    "trade_plan",
    "icon",
    "xabcd",
    "abcd",
    "head_shoulders",
]

#: The icons an icon drawing can show (Lucide names; the frontend holds their paths).
IconName = Literal[
    "arrow-up",
    "arrow-down",
    "arrow-left",
    "arrow-right",
    "trending-up",
    "trending-down",
    "circle-check",
    "circle-x",
    "alert",
    "info",
    "flag",
    "star",
    "bell",
    "zap",
]

#: Number of anchors each tool needs.
POINTS: dict[str, int] = {
    "trend_line": 2,
    "ray": 2,
    "extended_line": 2,
    "horizontal_line": 1,
    "horizontal_ray": 1,
    "vertical_line": 1,
    "rectangle": 2,
    "text": 1,
    "fib_retracement": 2,
    "fib_extension": 3,
    "parallel_channel": 3,
    "price_range": 2,
    "date_range": 2,
    "date_price_range": 2,
    "return_range": 2,
    "stats_range": 2,
    "trade_plan": 3,
    "icon": 1,
    "xabcd": 5,
    "abcd": 4,
    "head_shoulders": 7,
}

MAX_FIB_LEVELS = 24

HexColor = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]


class DrawingPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time: int = Field(description="UTC epoch seconds of the anchor bar's open")
    price: float

    @field_validator("price")
    @classmethod
    def _finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("price must be a finite number")
        return value


class DrawingStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line_color: HexColor = "#2962FF"
    line_width: int = Field(default=2, ge=1, le=4)
    line_style: Literal["solid", "dashed", "dotted"] = "solid"


class FibLevel(BaseModel):
    """One Fibonacci level: ratio ``value`` (0 = second anchor for a retracement), shown or not."""

    model_config = ConfigDict(extra="forbid")

    value: float = Field(ge=-10, le=10)
    color: HexColor
    visible: bool = True


class DrawingProps(BaseModel):
    """Tool-specific properties; each tool uses only its own (checked in ``Drawing``)."""

    model_config = ConfigDict(extra="forbid")

    text: str | None = Field(default=None, max_length=500, description="text tool")
    font_size: int | None = Field(default=None, ge=8, le=48, description="text tool")
    fill: bool | None = Field(default=None, description="rectangle: shade the inside")
    levels: list[FibLevel] | None = Field(
        default=None, max_length=MAX_FIB_LEVELS, description="Fib tools: the levels"
    )
    unit: Literal["year", "month", "week", "day", "bar"] | None = Field(
        default=None, description="return range: the unit T of the equivalent return"
    )
    returns: Literal["log", "simple"] | None = Field(
        default=None, description="statistics range: log or simple returns"
    )
    basis: Literal["close", "open"] | None = Field(
        default=None,
        description="statistics range: close-to-close returns, or open-to-close (within the bar)",
    )
    account: float | None = Field(
        default=None, gt=0, le=1e12, description="trade plan: account size for the position size"
    )
    risk_pct: float | None = Field(
        default=None, gt=0, le=100, description="trade plan: % of the account risked"
    )
    icon: IconName | None = Field(default=None, description="icon: which icon")
    icon_size: int | None = Field(default=None, ge=12, le=96, description="icon: size in px")


#: Props each tool may set.
ALLOWED_PROPS: dict[str, frozenset[str]] = {
    "text": frozenset({"text", "font_size"}),
    "rectangle": frozenset({"fill"}),
    "fib_retracement": frozenset({"levels"}),
    "fib_extension": frozenset({"levels"}),
    "return_range": frozenset({"unit"}),
    "stats_range": frozenset({"returns", "basis"}),
    "trade_plan": frozenset({"account", "risk_pct"}),
    "icon": frozenset({"icon", "icon_size"}),
}


class Drawing(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, description="Client-generated unique id")
    type: DrawingType
    points: list[DrawingPoint]
    style: DrawingStyle = DrawingStyle()
    props: DrawingProps = DrawingProps()
    locked: bool = False
    hidden: bool = False
    z: int = 0
    created_at: str = ""
    updated_at: str = ""

    @model_validator(mode="after")
    def _check_tool(self) -> Drawing:
        need = POINTS[self.type]
        if len(self.points) != need:
            raise ValueError(f"{self.type} needs {need} point(s), got {len(self.points)}")
        allowed = ALLOWED_PROPS.get(self.type, frozenset())
        extra = {name for name, value in self.props if value is not None} - allowed
        if extra:
            raise ValueError(f"{self.type} has no props {sorted(extra)}")
        return self


class DrawingsDocument(BaseModel):
    schema_version: int = SCHEMA_VERSION
    symbol: str
    revision: int = Field(ge=0, description="Bumped by every save; 0 = never saved")
    drawings: list[Drawing]


class DrawingsUpdate(BaseModel):
    """``PUT`` body: the full list, and the revision it was based on (optimistic locking)."""

    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0, description="Revision the client last read")
    drawings: list[Drawing] = Field(max_length=MAX_DRAWINGS)

    @field_validator("drawings")
    @classmethod
    def _unique_ids(cls, drawings: list[Drawing]) -> list[Drawing]:
        ids = [d.id for d in drawings]
        if len(set(ids)) != len(ids):
            raise ValueError("drawing ids must be unique")
        return drawings
