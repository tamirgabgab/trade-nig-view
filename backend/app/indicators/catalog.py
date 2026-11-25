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
    hurst,
    hv,
    hv_percentile,
    kama,
    lsma,
    ma_cross,
    ma_ribbon,
    macd,
    mcginley,
    moving_average,
    obv,
    pivots,
    prev_hlc,
    regime,
    rsi,
    sma,
    smma,
    stoch,
    swma,
    t3,
    tema,
    var_bands,
    variance_ratio,
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
        hv.SPEC,
        hv_percentile.SPEC,
        var_bands.SPEC,
        variance_ratio.SPEC,
        hurst.SPEC,
        obv.SPEC,
        vwap.SPEC,
        vol_sma.SPEC,
        prev_hlc.SPEC,
        pivots.SPEC,
        regime.SPEC,
    )
}


def get_spec(indicator_id: str) -> IndicatorSpec:
    try:
        return CATALOG[indicator_id]
    except KeyError:
        raise UnknownIndicatorError(f"Unknown indicator '{indicator_id}'") from None
