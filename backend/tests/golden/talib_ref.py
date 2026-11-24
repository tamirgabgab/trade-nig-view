"""TA-Lib as the second reference (optional: a native extension that may be missing or blocked)."""

from __future__ import annotations

import importlib
from typing import Protocol, cast

from app.models.bars import FloatArray


class TaLib(Protocol):
    def SMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def EMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def WMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def DEMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def TEMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def KAMA(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def LINEARREG(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def T3(self, real: FloatArray, timeperiod: int, vfactor: float) -> FloatArray: ...  # noqa: N802
    def BBANDS(  # noqa: N802
        self, real: FloatArray, timeperiod: int, nbdevup: float, nbdevdn: float, matype: int
    ) -> tuple[FloatArray, FloatArray, FloatArray]: ...
    def RSI(self, real: FloatArray, timeperiod: int) -> FloatArray: ...  # noqa: N802
    def MACD(  # noqa: N802
        self, real: FloatArray, fastperiod: int, slowperiod: int, signalperiod: int
    ) -> tuple[FloatArray, FloatArray, FloatArray]: ...
    def STOCH(  # noqa: N802
        self,
        high: FloatArray,
        low: FloatArray,
        close: FloatArray,
        fastk_period: int,
        slowk_period: int,
        slowk_matype: int,
        slowd_period: int,
        slowd_matype: int,
    ) -> tuple[FloatArray, FloatArray]: ...
    def STOCHF(  # noqa: N802
        self,
        high: FloatArray,
        low: FloatArray,
        close: FloatArray,
        fastk_period: int,
        fastd_period: int,
        fastd_matype: int,
    ) -> tuple[FloatArray, FloatArray]: ...
    def ATR(  # noqa: N802
        self, high: FloatArray, low: FloatArray, close: FloatArray, timeperiod: int
    ) -> FloatArray: ...
    def TRANGE(self, high: FloatArray, low: FloatArray, close: FloatArray) -> FloatArray: ...  # noqa: N802
    def OBV(self, real: FloatArray, volume: FloatArray) -> FloatArray: ...  # noqa: N802
    def STDDEV(self, real: FloatArray, timeperiod: int, nbdev: float) -> FloatArray: ...  # noqa: N802


def load_talib() -> tuple[TaLib | None, str]:
    """The ``talib`` module, or ``None`` with the reason it could not be imported."""
    try:
        return cast("TaLib", importlib.import_module("talib")), ""
    except (ImportError, OSError) as exc:  # also "DLL load failed" when Smart App Control blocks it
        return None, f"TA-Lib not available ({exc}); the golden model still covers every bar"
