from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import REPO_ROOT
from app.data.universe import Universe
from app.models.symbols import SymbolInfo

REAL_UNIVERSE = REPO_ROOT / "backend" / "config" / "universe.toml"


def test_real_universe_loads_with_expected_sections() -> None:
    universe = Universe.load(REAL_UNIVERSE)
    groups = list(dict.fromkeys(info.group for info in universe.symbols))
    assert groups == ["Indices", "Benchmarks", "ETFs", "Stocks", "Futures", "Forex"]
    assert universe.resolve("SPX") == universe.resolve("^gspc")
    # Phase H: total-return benchmarks, Israel, and the shekel.
    assert [i.display for i in universe.search(group="Benchmarks")] == ["SPXTR", "XNDX", "TA125"]
    ta125, usd_ils = universe.resolve("TA125"), universe.resolve("USDILS")
    assert ta125 is not None
    assert (ta125.timezone, ta125.friday_hours) == ("Asia/Jerusalem", "10:00-14:00")
    assert usd_ils is not None
    assert usd_ils.symbol == "ILS=X"
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


@pytest.mark.parametrize("hours", ["10:00", "17:00-09:00", "9-17", "10:00-25:00"])
def test_trading_hours_are_validated(hours: str) -> None:
    with pytest.raises(ValidationError):
        SymbolInfo(
            symbol="X", display="X", name="X", type="index", group="G", exchange="E",
            cash_hours=hours,
        )  # fmt: skip
