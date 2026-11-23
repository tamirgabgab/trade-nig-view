"""TA-Lib as the second reference (optional: a native extension that may be missing or blocked)."""

from __future__ import annotations

import importlib
from typing import Protocol, cast

from app.models.bars import FloatArray


class TaLib(Protocol):
    def SMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def EMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def WMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802


def load_talib() -> tuple[TaLib | None, str]:
    """The ``talib`` module, or ``None`` with the reason it could not be imported."""
    try:
        return cast("TaLib", importlib.import_module("talib")), ""
    except ImportError as exc:  # also "DLL load failed" when Smart App Control blocks it
        return None, f"TA-Lib not available ({exc}); the golden model still covers every bar"
