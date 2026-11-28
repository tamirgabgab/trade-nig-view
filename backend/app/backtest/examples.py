"""Built-in example strategies (read-only; "Save as" stores a copy the user can change)."""

from __future__ import annotations

from typing import Any

from .strategy import RulesStrategy


def _ind(i: int, output: str) -> dict[str, Any]:
    return {"indicator": i, "output": output}


def _num(x: float) -> dict[str, Any]:
    return {"value": x}


def _cond(left: dict[str, Any], op: str, right: dict[str, Any]) -> dict[str, Any]:
    return {"left": left, "op": op, "right": right}


_FAST, _SLOW, _WEEKLY = _ind(0, "ma"), _ind(1, "ma"), _ind(2, "ma")
_RSI, _REGIME = _ind(0, "rsi"), _ind(1, "regime")

EXAMPLES: dict[str, RulesStrategy] = {
    "Example: MA 20/50 cross with the weekly trend": RulesStrategy.model_validate(
        {
            "description": "Long when SMA 20 crosses above SMA 50 while the close is above the "
            "weekly SMA 30 (last closed week); short in the mirror case.",
            "profile": "position",
            "indicators": [
                {"id": "sma", "params": {"length": 20}},
                {"id": "sma", "params": {"length": 50}},
                {"id": "sma", "params": {"length": 30}, "interval": "1W"},
            ],
            "long": {
                "entry": [
                    [_cond(_FAST, "crosses_above", _SLOW), _cond({"price": "close"}, "gt", _WEEKLY)]
                ],
                "exit": [[_cond(_FAST, "crosses_below", _SLOW)]],
            },
            "short": {
                "entry": [
                    [_cond(_FAST, "crosses_below", _SLOW), _cond({"price": "close"}, "lt", _WEEKLY)]
                ],
                "exit": [[_cond(_FAST, "crosses_above", _SLOW)]],
            },
            "exits": {"stop": {"kind": "atr", "value": 3}},
        }
    ),
    "Example: RSI reversion outside trends": RulesStrategy.model_validate(
        {
            "description": "Long when RSI 14 climbs back over 30, short when it falls back under "
            "70, only while the regime is not trending (regime < 0.5).",
            "profile": "position",
            "indicators": [{"id": "rsi"}, {"id": "regime"}],
            "long": {
                "entry": [[_cond(_RSI, "crosses_above", _num(30))]],
                "exit": [[_cond(_RSI, "crosses_above", _num(55))]],
            },
            "short": {
                "entry": [[_cond(_RSI, "crosses_below", _num(70))]],
                "exit": [[_cond(_RSI, "crosses_below", _num(45))]],
            },
            "filters": [[_cond(_REGIME, "lt", _num(0.5))]],
            "exits": {"time_stop_bars": 15},
        }
    ),
}
