"""All registered indicators, in the order the indicators dialog lists them."""

from __future__ import annotations

from app.indicators import (
    alma,
    atr,
    bb,
    dema,
    ema,
    envelope,
    hma,
    kama,
    lsma,
    ma_cross,
    ma_ribbon,
    macd,
    mcginley,
    moving_average,
    obv,
    rsi,
    sma,
    smma,
    stoch,
    swma,
    t3,
    tema,
    vol_sma,
    vwap,
    vwma,
    wma,
    zlema,
)
from app.indicators.registry import IndicatorSpec, UnknownIndicatorError

CATALOG: dict[str, IndicatorSpec] = {
    spec.id: spec
    for spec in (
        sma.SPEC,
        ema.SPEC,
        wma.SPEC,
        smma.SPEC,
        dema.SPEC,
        tema.SPEC,
        hma.SPEC,
        lsma.SPEC,
        alma.SPEC,
        swma.SPEC,
        vwma.SPEC,
        mcginley.SPEC,
        kama.SPEC,
        t3.SPEC,
        zlema.SPEC,
        moving_average.SPEC,
        ma_cross.SPEC,
        ma_ribbon.SPEC,
        envelope.SPEC,
        bb.SPEC,
        rsi.SPEC,
        macd.SPEC,
        stoch.SPEC,
        atr.SPEC,
        obv.SPEC,
        vwap.SPEC,
        vol_sma.SPEC,
    )
}


def get_spec(indicator_id: str) -> IndicatorSpec:
    try:
        return CATALOG[indicator_id]
    except KeyError:
        raise UnknownIndicatorError(f"Unknown indicator '{indicator_id}'") from None
