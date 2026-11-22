from __future__ import annotations

import pytest

from app.config import REPO_ROOT
from app.data.universe import Universe
from app.models.symbols import SymbolInfo

REAL_UNIVERSE = REPO_ROOT / "backend" / "config" / "universe.toml"


def test_real_universe_loads_with_expected_sections() -> None:
    universe = Universe.load(REAL_UNIVERSE)
    groups = list(dict.fromkeys(info.group for info in universe.symbols))
    assert groups == ["Indices", "ETFs", "Stocks", "Futures", "Forex"]
    assert universe.resolve("SPX") == universe.resolve("^gspc")
    assert universe.resolve("AAPL") is not None
    indices = universe.search(group="Indices")
    assert all(not info.has_volume for info in indices)


def test_search_matches_symbol_display_and_name() -> None:
    universe = Universe.load(REAL_UNIVERSE)
    assert [i.symbol for i in universe.search("apple")] == ["AAPL"]
    assert [i.display for i in universe.search("gold")] == ["GC1!"]
    assert universe.search("zzz") == []


def test_duplicate_display_names_are_rejected() -> None:
    a = SymbolInfo(symbol="A", display="X", name="a", type="stock", group="S", exchange="E")
    b = SymbolInfo(symbol="B", display="X", name="b", type="stock", group="S", exchange="E")
    with pytest.raises(ValueError, match="Duplicate"):
        Universe([a, b])


def test_sessions_spanning_midnight_have_a_session_start() -> None:
    """Futures, forex and ICE DXY trade overnight: their 1h bars need a session start."""
    universe = Universe.load(REAL_UNIVERSE)
    for info in universe.symbols:
        overnight = info.type in {"future", "forex"} or info.symbol == "DX-Y.NYB"
        assert (info.session_start is not None) == overnight, info.symbol
    assert universe.resolve("GC1!") == universe.resolve("GC=F")
