"""Registry contract: every spec is complete, its params validate, its learn page exists."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from app.indicators.catalog import CATALOG, get_spec
from app.indicators.registry import (
    IndicatorSpec,
    InvalidParamsError,
    ParamValue,
    UnknownIndicatorError,
    length_lookback,
    resolve_params,
)
from app.models.bars import BarFrame

DOCS = Path(__file__).resolve().parents[4] / "docs" / "indicators"
SPECS = sorted(CATALOG.values(), key=lambda s: s.id)


def clean_frame(n: int = 600) -> BarFrame:
    rng = np.random.default_rng(3)
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    return BarFrame.from_columns(
        time=np.arange(n) * 86_400,
        open=close + 0.1,
        high=close + 1.0,
        low=close - 1.0,
        close=close,
        volume=np.full(n, 1000.0),
    )


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.id)
def test_spec_is_complete(spec: IndicatorSpec) -> None:
    assert spec.id == spec.id.lower()
    assert spec.params
    assert spec.outputs
    assert (DOCS / f"{spec.learn_slug}.md").is_file(), "learn-page stub missing"
    for p in spec.params:
        assert p.label
        if p.type in ("int", "float"):
            assert isinstance(p.default, int | float)
            assert p.min is not None
            assert p.max is not None
            assert p.min <= p.default <= p.max
        if p.type in ("enum", "source"):
            assert p.default in p.options
        if p.type == "bool":
            assert isinstance(p.default, bool)
    for o in spec.outputs:
        assert o.color.startswith("#")
        assert len(o.color) == 7


def with_length(spec: IndicatorSpec, length: int) -> dict[str, ParamValue]:
    """Defaults with every ``*length*`` input set to ``length`` (clamped to its minimum) and an
    integer ``offset`` of 2, where the spec has those inputs."""
    params = spec.defaults()
    for p in spec.params:
        if p.type == "int" and "length" in p.name:
            params[p.name] = max(length, int(p.min or 1))
        elif p.name == "offset" and p.type == "int":
            params[p.name] = 2
    return params


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.id)
@pytest.mark.parametrize("length", [1, 5, 30])
def test_warmup_matches_the_nan_prefix(spec: IndicatorSpec, length: int) -> None:
    """Every line output starts exactly at ``warmup`` and has no gaps after it (markers are
    sparse by design and only must not start earlier)."""
    params = with_length(spec, length)
    outputs = spec.run(clean_frame(), params)
    warmup = spec.warmup(params)
    for o in spec.outputs:
        values = outputs[o.name]
        valid = np.flatnonzero(~np.isnan(values))
        if o.plot == "markers":
            assert valid.size == 0 or valid[0] > warmup
            continue
        assert int(valid[0]) == warmup, o.name
        assert not np.isnan(values[warmup:]).any(), o.name


@pytest.mark.parametrize("spec", SPECS, ids=lambda s: s.id)
def test_enum_option_labels_match_options(spec: IndicatorSpec) -> None:
    for p in spec.params:
        if p.option_labels:
            assert len(p.option_labels) == len(p.options)


def test_defaults_are_filled_in_and_values_coerced() -> None:
    spec = get_spec("ema")
    assert resolve_params(spec, {}) == {"source": "close", "length": 9, "offset": 0}
    assert resolve_params(spec, {"length": 20.0})["length"] == 20
    assert isinstance(resolve_params(spec, {"length": 20.0})["length"], int)


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        ({"length": 0}, ">= 1"),
        ({"length": 5001}, "<= 5000"),
        ({"length": 2.5}, "integer"),
        ({"length": True}, "integer"),
        ({"length": "9"}, "integer"),
        ({"offset": -1}, ">= 0"),
        ({"source": "volume"}, "one of"),
        ({"source": 3}, "one of"),
        ({"colour": "red"}, "Unknown parameter"),
    ],
)
def test_invalid_params_are_rejected(raw: dict[str, object], message: str) -> None:
    with pytest.raises(InvalidParamsError, match=message):
        resolve_params(get_spec("sma"), raw)


def test_unknown_indicator() -> None:
    with pytest.raises(UnknownIndicatorError, match="nope"):
        get_spec("nope")


def test_lookback_contract() -> None:
    assert length_lookback({"length": 9}) == 250
    assert length_lookback({"length": 20, "offset": 400}) == 500
    assert length_lookback({"fast_length": 9, "slow_length": 40}) == 1000
    assert length_lookback({"source": "close"}) == 250
