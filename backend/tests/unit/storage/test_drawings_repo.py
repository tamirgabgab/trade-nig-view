from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.drawings import Drawing, DrawingPoint, DrawingsUpdate
from app.storage.drawings import DrawingsRepository, RevisionConflictError, migrate


def line(id_: str = "a") -> Drawing:
    return Drawing(
        id=id_,
        type="trend_line",
        points=[
            DrawingPoint(time=1_700_000_000, price=10.0),
            DrawingPoint(time=1_700_086_400, price=12.5),
        ],
    )


def test_empty_symbol_reads_as_revision_zero(tmp_path: Path) -> None:
    repo = DrawingsRepository(tmp_path / "app.db")
    doc = repo.get("AAPL")
    assert (doc.revision, doc.drawings, doc.schema_version) == (0, [], 1)


def test_put_bumps_the_revision_and_survives_a_reopen(tmp_path: Path) -> None:
    repo = DrawingsRepository(tmp_path / "app.db")
    first = repo.put("AAPL", 0, [line()])
    second = repo.put("AAPL", first.revision, [line("a"), line("b")])
    assert (first.revision, second.revision) == (1, 2)
    repo.close()

    again = DrawingsRepository(tmp_path / "app.db").get("AAPL")
    assert again.revision == 2
    assert [d.id for d in again.drawings] == ["a", "b"]
    assert again.drawings[0].points[1].price == 12.5


def test_a_stale_revision_is_a_conflict(tmp_path: Path) -> None:
    repo = DrawingsRepository(tmp_path / "app.db")
    repo.put("AAPL", 0, [line()])
    with pytest.raises(RevisionConflictError, match="revision 1"):
        repo.put("AAPL", 0, [])
    assert repo.get("AAPL").revision == 1


def test_symbols_are_independent(tmp_path: Path) -> None:
    repo = DrawingsRepository(tmp_path / "app.db")
    repo.put("AAPL", 0, [line()])
    assert repo.get("MSFT").drawings == []


def test_migrate_keeps_v1_and_refuses_a_newer_schema() -> None:
    doc: dict[str, object] = {"symbol": "AAPL", "revision": 3, "drawings": []}
    assert migrate(doc)["schema_version"] == 1
    with pytest.raises(ValueError, match="unsupported"):
        migrate({**doc, "schema_version": 99})


@pytest.mark.parametrize(
    ("kind", "points", "props", "error"),
    [
        ("trend_line", 1, {}, "needs 2 point"),
        ("horizontal_line", 2, {}, "needs 1 point"),
        ("trend_line", 2, {"text": "hi"}, "no props"),
        ("rectangle", 2, {"fill": True}, None),
        ("text", 1, {"text": "Breakout", "font_size": 14}, None),
        ("fib_retracement", 2, {"levels": [{"value": 0.618, "color": "#089981"}]}, None),
        ("fib_extension", 2, {}, "needs 3 point"),
        ("fib_extension", 3, {"levels": [{"value": 1.618, "color": "#2962FF"}]}, None),
        ("parallel_channel", 3, {}, None),
        ("price_range", 2, {"levels": []}, "no props"),
        ("date_price_range", 2, {}, None),
        ("return_range", 2, {"unit": "month"}, None),
        ("return_range", 2, {"unit": "decade"}, "literal_error|Input should be"),
        ("stats_range", 2, {"returns": "log", "basis": "open"}, None),
        ("stats_range", 2, {"unit": "year"}, "no props"),
        ("trade_plan", 3, {"account": 10_000, "risk_pct": 1}, None),
        ("trade_plan", 2, {}, "needs 3 point"),
        ("trade_plan", 3, {"risk_pct": 0}, "greater than"),
        ("fib_retracement", 2, {"levels": [{"value": 99, "color": "#089981"}]}, "less than"),
        ("fib_retracement", 2, {"levels": [{"value": 1, "color": "red"}]}, "pattern"),
    ],
)
def test_each_tool_checks_its_points_and_props(
    kind: str, points: int, props: dict[str, object], error: str | None
) -> None:
    raw = {
        "id": "x",
        "type": kind,
        "points": [{"time": 1, "price": 1.0}] * points,
        "props": props,
    }
    if error is None:
        assert Drawing.model_validate(raw).type == kind
    else:
        with pytest.raises(ValidationError, match=error):
            Drawing.model_validate(raw)


def test_update_rejects_duplicate_ids_and_non_finite_prices() -> None:
    with pytest.raises(ValidationError, match="unique"):
        DrawingsUpdate(revision=0, drawings=[line("a"), line("a")])
    with pytest.raises(ValidationError, match="finite"):
        DrawingPoint(time=1, price=float("nan"))
