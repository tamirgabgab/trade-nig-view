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
    assert [i.display for i in universe.search("gold")] == ["GOLD"]
    assert universe.search("zzz") == []


def test_duplicate_display_names_are_rejected() -> None:
    a = SymbolInfo(symbol="A", display="X", name="a", type="stock", group="S", exchange="E")
    b = SymbolInfo(symbol="B", display="X", name="b", type="stock", group="S", exchange="E")
    with pytest.raises(ValueError, match="Duplicate"):
        Universe([a, b])
