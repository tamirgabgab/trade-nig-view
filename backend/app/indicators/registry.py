"""Indicator metadata (``IndicatorSpec``) and parameter validation.

The frontend builds its whole indicator UI (dialog, settings panel, legend) from these specs, so an
indicator is added in the backend only (docs/ARCHITECTURE.md section 5.1).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from http import HTTPStatus
from typing import Literal

from app.errors import ChartLabError
from app.models.bars import BarFrame, FloatArray

ParamValue = int | float | bool | str
Params = Mapping[str, ParamValue]
ComputeFn = Callable[[BarFrame, Params], dict[str, FloatArray]]
CountFn = Callable[[Params], int]

ParamType = Literal["int", "float", "bool", "enum", "source"]
PlotStyle = Literal["line", "histogram", "area", "markers"]
Category = Literal["moving_averages", "bands", "oscillators", "volatility", "volume", "structure"]
Input = Literal["open", "high", "low", "close", "volume"]

#: Minimum warm-up history added before the requested range (ARCHITECTURE section 3.2).
MIN_LOOKBACK = 250
#: Lookback per bar of the longest length: the RMA seed sits at bar n-1 of the loaded history, so
#: its weight on the first visible bar is at most e^-24 = 3.8e-11.
LOOKBACK_PER_LENGTH = 25


class UnknownIndicatorError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "indicator_not_found"


class InvalidParamsError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_params"


@dataclass(frozen=True, slots=True)
class ParamSpec:
    """One input of an indicator, as shown in its settings panel."""

    name: str
    type: ParamType
    default: ParamValue
    label: str
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: tuple[str, ...] = ()
    option_labels: tuple[str, ...] = ()
    #: Name of the bool / enum param that switches this one on (it applies only while that
    #: param is true or not "none"); the UI greys it out and leaves it out of the legend.
    requires: str | None = None


@dataclass(frozen=True, slots=True)
class OutputSpec:
    """One plotted series of an indicator."""

    name: str
    label: str
    plot: PlotStyle
    color: str
    line_width: int = 2
    style: Mapping[str, str] = field(default_factory=dict[str, str])
    #: As ``ParamSpec.requires``: the line exists only while that param switches it on.
    requires: str | None = None


def length_lookback(params: Params) -> int:
    """``max(25 * n, 250)`` for the longest ``*length*`` parameter (n = 0 if there is none)."""
    lengths = [
        int(value)
        for name, value in params.items()
        if "length" in name and isinstance(value, int | float) and not isinstance(value, bool)
    ]
    return max(LOOKBACK_PER_LENGTH * max(lengths, default=0), MIN_LOOKBACK)


def no_shift(_params: Params) -> int:
    return 0


@dataclass(frozen=True, slots=True)
class IndicatorSpec:
    """Registry entry: metadata for the UI plus the pure compute function."""

    id: str
    version: int
    name: str
    short_name: str
    category: Category
    overlay: bool
    inputs: tuple[Input, ...]
    params: tuple[ParamSpec, ...]
    outputs: tuple[OutputSpec, ...]
    #: First bar index where the **last** output to start has a value (for composites, the
    #: slowest line; a faster output can start earlier).
    warmup: CountFn
    compute: ComputeFn
    learn_slug: str
    description: str = ""
    levels: tuple[float, ...] = ()
    #: Shade the band between these two levels (low, high) in the indicator's pane, e.g. RSI 30-70.
    level_fill: tuple[float, float] | None = None
    lookback: CountFn = length_lookback
    #: Plot offset in bars (``core.shift``) the outputs are moved right by; 0 if none.
    shift: CountFn = no_shift
    #: Bars the chart draws the outputs to the LEFT of their bar (presentation only: values stay
    #: causal, e.g. a pivot confirmed R bars later is drawn on its pivot bar).
    display_shift: CountFn = no_shift
    #: Values only on intraday bars (session-anchored, e.g. VWAP); all NaN on daily and longer.
    intraday_only: bool = False

    def total_lookback(self, params: Params) -> int:
        """History needed before the first requested bar: ``lookback`` plus the plot shift.

        A plot shift of k bars moves the value of bar t - k onto bar t, so k more bars are needed
        for the first shown value to be warmed up.
        """
        return self.lookback(params) + self.shift(params)

    def defaults(self) -> dict[str, ParamValue]:
        return {p.name: p.default for p in self.params}

    def run(
        self, frame: BarFrame, params: Mapping[str, object] | None = None
    ) -> dict[str, FloatArray]:
        """Validate ``params`` (defaults fill the gaps) and compute every output."""
        resolved = resolve_params(self, params or {})
        outputs = self.compute(frame, resolved)
        missing = {o.name for o in self.outputs} - outputs.keys()
        if missing:  # pragma: no cover - guarded by the registry tests
            raise RuntimeError(f"{self.id} did not compute {sorted(missing)}")
        return outputs


def _check_number(spec: ParamSpec, value: float) -> None:
    if not math.isfinite(value):
        raise InvalidParamsError(f"'{spec.name}' must be a finite number")
    if spec.min is not None and value < spec.min:
        raise InvalidParamsError(f"'{spec.name}' must be >= {spec.min:g}, got {value:g}")
    if spec.max is not None and value > spec.max:
        raise InvalidParamsError(f"'{spec.name}' must be <= {spec.max:g}, got {value:g}")


def _coerce(spec: ParamSpec, value: object) -> ParamValue:
    """``value`` converted to the parameter's type, or ``InvalidParamsError``."""
    match spec.type:
        case "int":
            if isinstance(value, bool) or not isinstance(value, int | float):
                raise InvalidParamsError(f"'{spec.name}' must be an integer")
            if isinstance(value, float) and not value.is_integer():
                raise InvalidParamsError(f"'{spec.name}' must be an integer, got {value:g}")
            _check_number(spec, float(value))
            return int(value)
        case "float":
            if isinstance(value, bool) or not isinstance(value, int | float):
                raise InvalidParamsError(f"'{spec.name}' must be a number")
            _check_number(spec, float(value))
            return float(value)
        case "bool":
            if not isinstance(value, bool):
                raise InvalidParamsError(f"'{spec.name}' must be true or false")
            return value
        case "enum" | "source":
            if not isinstance(value, str) or value not in spec.options:
                choices = ", ".join(spec.options)
                raise InvalidParamsError(f"'{spec.name}' must be one of: {choices}")
            return value


def resolve_params(spec: IndicatorSpec, raw: Mapping[str, object]) -> dict[str, ParamValue]:
    """Defaults overlaid with ``raw``; unknown names and out-of-range values are rejected."""
    known = {p.name: p for p in spec.params}
    unknown = sorted(set(raw) - known.keys())
    if unknown:
        raise InvalidParamsError(f"Unknown parameter(s) for {spec.id}: {', '.join(unknown)}")
    return {name: _coerce(p, raw[name]) if name in raw else p.default for name, p in known.items()}
