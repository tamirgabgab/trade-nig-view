"""All registered indicators, in the order the indicators dialog lists them."""

from __future__ import annotations

from app.indicators import ema, sma, smma, wma
from app.indicators.registry import IndicatorSpec, UnknownIndicatorError

CATALOG: dict[str, IndicatorSpec] = {
    spec.id: spec for spec in (sma.SPEC, ema.SPEC, wma.SPEC, smma.SPEC)
}


def get_spec(indicator_id: str) -> IndicatorSpec:
    try:
        return CATALOG[indicator_id]
    except KeyError:
        raise UnknownIndicatorError(f"Unknown indicator '{indicator_id}'") from None
