"""Strategies written in Python: one file per strategy in ``strategies/`` at the repo root.

The contract (``strategies/README.md``)::

    SPEC = {
        "description": "Close against its moving average",
        "params": {"length": {"type": "int", "default": 20, "min": 2, "max": 400}},
    }

    def signals(bars, params, ind):
        ma = ind("sma", length=params["length"])["ma"]
        return {"long_entry": bars.close > ma, "long_exit": bars.close < ma}

``bars`` is the decision interval's ``BarFrame`` (read-only numpy columns), ``params`` the resolved
values, and ``ind(indicator_id, interval=None, **params)`` the registry's indicators, on the
decision bars or, with ``interval``, on one of the profile's context intervals (aligned as in
``app.backtest.signals``). The result maps any of ``long_entry``, ``long_exit``, ``short_entry``,
``short_exit`` to one boolean per bar; a missing key never fires.

**Trust.** A file runs inside the backend with its full rights: it is the user's own code on the
user's own machine, as trusted as the app itself (ADR 0036). Nothing here is a sandbox.

**Lookahead.** Each run is repeated on prefixes of the bars; if a signal on an early bar changes
when later bars are added, the strategy reads the future (or is not deterministic) and the run is
refused. This catches a peek at bar :math:`t + 1`; it is a check, not a proof.

Files are imported again when their modification time changes.
"""

from __future__ import annotations

import importlib.util
import threading
import traceback
from collections.abc import Callable, Mapping
from dataclasses import dataclass, fields, replace
from http import HTTPStatus
from pathlib import Path
from typing import Any, Literal, cast

import numpy as np
from pydantic import BaseModel, ConfigDict, ValidationError

from app.analysis.conditions import BoolArray
from app.errors import ChartLabError
from app.indicators.registry import ParamSpec, ParamValue, resolve_values
from app.models.bars import BarFrame, Interval

from .signals import SIGNAL_NAMES, IndicatorSource, Outputs, Signals

SignalsFn = Callable[..., object]


class PythonStrategyNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "python_strategy_not_found"


class PythonStrategyError(ChartLabError):
    """The file does not import, breaks the contract, or raised while computing signals."""

    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "python_strategy_error"


class StrategyLookaheadError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "strategy_lookahead"


class _ParamDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["int", "float", "bool"]
    default: bool | int | float
    label: str | None = None
    min: float | None = None
    max: float | None = None


class _Spec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = ""
    params: dict[str, _ParamDef] = {}


@dataclass(frozen=True, slots=True)
class PythonModule:
    name: str
    path: Path
    description: str
    params: tuple[ParamSpec, ...]
    signals: SignalsFn


def _where(e: BaseException, path: Path) -> str:
    """``file line N: Error: message``, the line being the last one of ``path`` in the trace."""
    if isinstance(e, SyntaxError):
        return f"{path.name} line {e.lineno}: SyntaxError: {e.msg}"
    lines = [f.lineno for f in traceback.extract_tb(e.__traceback__) if Path(f.filename) == path]
    at = f" line {lines[-1]}" if lines else ""
    return f"{path.name}{at}: {type(e).__name__}: {e}"


def _import(name: str, path: Path) -> PythonModule:
    spec = importlib.util.spec_from_file_location(f"chartlab_strategy_{name}", path)
    if spec is None or spec.loader is None:  # pragma: no cover - a .py file always has a loader
        raise PythonStrategyError(f"{path.name}: cannot be imported")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as e:
        raise PythonStrategyError(_where(e, path)) from None
    raw_spec: object = getattr(module, "SPEC", {})
    fn: object = getattr(module, "signals", None)
    if not callable(fn):
        raise PythonStrategyError(f"{path.name}: define a function signals(bars, params, ind)")
    try:
        parsed = _Spec.model_validate(raw_spec)
    except ValidationError as e:
        first = e.errors()[0]
        loc = ".".join(str(p) for p in first["loc"])
        raise PythonStrategyError(f"{path.name}: SPEC.{loc}: {first['msg']}") from None
    params = tuple(
        ParamSpec(name=k, type=p.type, default=p.default, label=p.label or k, min=p.min, max=p.max)
        for k, p in parsed.params.items()
    )
    try:  # the defaults must pass their own limits
        resolve_values(path.name, params, {p.name: p.default for p in params})
    except ChartLabError as e:
        raise PythonStrategyError(f"{path.name}: SPEC default: {e.detail}") from None
    return PythonModule(name, path, parsed.description, params, fn)


class PythonStrategies:
    """The strategy files of one folder, imported on demand and again when they change."""

    def __init__(self, directory: Path) -> None:
        self._dir = directory
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[int, PythonModule]] = {}

    def names(self) -> list[str]:
        """Stems of the ``.py`` files (files starting with ``_`` are helpers, not strategies)."""
        if not self._dir.is_dir():
            return []
        return sorted(p.stem for p in self._dir.glob("*.py") if not p.stem.startswith("_"))

    def load(self, name: str) -> PythonModule:
        path = self._dir / f"{name}.py"
        if name.startswith("_") or not path.is_file():
            raise PythonStrategyNotFoundError(f"No strategy file strategies/{name}.py")
        mtime = path.stat().st_mtime_ns
        with self._lock:
            cached = self._cache.get(name)
            if cached is not None and cached[0] == mtime:
                return cached[1]
            module = _import(name, path)
            self._cache[name] = (mtime, module)
            return module


def _readonly(frame: BarFrame) -> BarFrame:
    """The same bars with read-only views of the columns (a strategy cannot edit the cache)."""
    columns: dict[str, Any] = {}
    for f in fields(frame):
        value = getattr(frame, f.name)
        if isinstance(value, np.ndarray):
            view = cast("np.ndarray[Any, Any]", value).view()
            view.flags.writeable = False
            columns[f.name] = view
    return replace(frame, **columns)


def _as_signal(name: str, value: object, n: int) -> BoolArray:
    arr: np.ndarray[Any, Any] = np.asarray(value)
    if arr.shape != (n,):
        raise ValueError(f"'{name}' has shape {arr.shape}, expected ({n},): one value per bar")
    if arr.dtype.kind == "b":
        return arr.astype(np.bool_)
    if arr.dtype.kind in "iuf":
        if not np.isfinite(arr).all():
            raise ValueError(f"'{name}' has NaN or infinite values: give booleans")
        return arr != 0
    raise ValueError(f"'{name}' must be booleans, got {arr.dtype}")


def _call(
    module: PythonModule, values: Mapping[str, ParamValue], source: IndicatorSource
) -> Signals:
    n = len(source.frame)

    def ind(indicator_id: str, interval: str | None = None, **params: object) -> Outputs:
        return source(indicator_id, None if interval is None else Interval(interval), params)

    try:
        raw = module.signals(_readonly(source.frame), dict(values), ind)
        if not isinstance(raw, Mapping):
            raise TypeError("signals() must return a dict of signal name -> booleans")
        result = cast("Mapping[str, object]", raw)
        unknown = sorted(set(result) - set(SIGNAL_NAMES))
        if unknown:
            raise ValueError(f"unknown signal(s) {unknown}; use {', '.join(SIGNAL_NAMES)}")
        arrays = {
            name: _as_signal(name, result[name], n)
            if name in result
            else np.zeros(n, dtype=np.bool_)
            for name in SIGNAL_NAMES
        }
    except Exception as e:
        raise PythonStrategyError(_where(e, module.path)) from None
    return Signals(**arrays)


def prefix_cuts(n: int) -> list[int]:
    """Prefix lengths the lookahead check reruns on: sixths of the bars, and all but the last."""
    return sorted({c for c in [n * k // 6 for k in range(1, 6)] + [n - 1] if 0 < c < n})


def python_signals(
    module: PythonModule, params: Mapping[str, object], source: IndicatorSource
) -> Signals:
    """The module's signals on ``source.frame``, refused if a prefix disagrees (lookahead)."""
    values = resolve_values(f"strategies/{module.name}.py", module.params, params)
    full = _call(module, values, source)
    for cut in prefix_cuts(len(source.frame)):
        part = _call(module, values, source.prefix(cut))
        for name in SIGNAL_NAMES:
            diff = np.flatnonzero(getattr(part, name) != getattr(full, name)[:cut])
            if len(diff):
                raise StrategyLookaheadError(
                    f"{module.path.name}: '{name}' at bar {int(diff[0])} changes when later bars "
                    f"are added (run on the first {cut} bars it differs): the strategy reads the "
                    "future, or is not deterministic"
                )
    return full
