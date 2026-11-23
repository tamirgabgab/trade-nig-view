"""``/api/layouts`` - named, saved chart layouts (symbol, interval, chart and indicator setup)."""

from __future__ import annotations

from http import HTTPStatus
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_layouts, get_universe
from app.data.universe import Universe
from app.errors import ChartLabError
from app.indicators.catalog import CATALOG
from app.indicators.registry import resolve_params
from app.models.bars import Interval
from app.models.layouts import (
    SCHEMA_VERSION,
    DocumentName,
    LayoutDocument,
    LayoutIndicator,
    LayoutList,
    LayoutSummary,
    LayoutUpdate,
)
from app.storage.documents import Document, DocumentStore

router = APIRouter(tags=["layouts"])

_CONFLICT: dict[int | str, dict[str, Any]] = {
    409: {"description": "Saved meanwhile elsewhere: reload (problem+json)"}
}
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "No layout with this name (problem+json)"}
}


class LayoutNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "layout_not_found"


class InvalidLayoutError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_layout"


def _document(name: str, revision: int, updated_at: str, document: Document) -> LayoutDocument:
    return LayoutDocument.model_validate(
        {**document, "name": name, "revision": revision, "updated_at": updated_at}
    )


def _checked_indicator(indicator: LayoutIndicator) -> LayoutIndicator:
    """``indicator`` with its params coerced; unknown id / params / output names are a 422."""
    spec = CATALOG.get(indicator.id)
    if spec is None:
        raise InvalidLayoutError(f"Unknown indicator {indicator.id!r}")
    resolved = resolve_params(spec, indicator.params)
    unknown = sorted(indicator.styles.keys() - {o.name for o in spec.outputs})
    if unknown:
        raise InvalidLayoutError(f"{spec.id} has no output(s) {', '.join(unknown)}")
    return indicator.model_copy(update={"params": {k: resolved[k] for k in indicator.params}})


@router.get("/layouts", response_model=LayoutList)
def list_layouts(store: Annotated[DocumentStore, Depends(get_layouts)]) -> LayoutList:
    """Every saved layout, newest first."""
    return LayoutList(
        layouts=[
            LayoutSummary(
                name=name,
                revision=revision,
                updated_at=updated_at,
                symbol=str(document["symbol"]),
                interval=Interval(str(document["interval"])),
            )
            for name, revision, updated_at, document in store.list()
        ]
    )


@router.get("/layouts/{name}", response_model=LayoutDocument, responses=_NOT_FOUND)
def get_layout(
    name: DocumentName, store: Annotated[DocumentStore, Depends(get_layouts)]
) -> LayoutDocument:
    """One saved layout."""
    found = store.get(name)
    if found is None:
        raise LayoutNotFoundError(f"No layout named {name!r}")
    revision, document, updated_at = found
    return _document(name, revision, updated_at, document)


@router.put("/layouts/{name}", response_model=LayoutDocument, responses=_CONFLICT)
def put_layout(
    name: DocumentName,
    body: LayoutUpdate,
    universe: Annotated[Universe, Depends(get_universe)],
    store: Annotated[DocumentStore, Depends(get_layouts)],
) -> LayoutDocument:
    """Create (``revision`` 0) or replace a layout; a stale ``revision`` is a 409."""
    info = universe.resolve(body.symbol)
    if info is None:
        raise InvalidLayoutError(f"Unknown symbol {body.symbol!r}")
    layout = body.model_copy(
        update={
            "symbol": info.symbol,
            "indicators": [_checked_indicator(i) for i in body.indicators],
        }
    )
    document: Document = {
        "schema_version": SCHEMA_VERSION,
        **layout.model_dump(mode="json", by_alias=True, exclude={"revision"}),
    }
    revision, updated_at = store.put(name, body.revision, document)
    return _document(name, revision, updated_at, document)


@router.delete(
    "/layouts/{name}",
    status_code=HTTPStatus.NO_CONTENT,
    response_class=Response,
    responses={**_NOT_FOUND, **_CONFLICT},
)
def delete_layout(
    name: DocumentName,
    revision: Annotated[int, Query(ge=0, description="Revision the client last read")],
    store: Annotated[DocumentStore, Depends(get_layouts)],
) -> None:
    """Delete a layout; a stale ``revision`` is a 409."""
    store.delete(name, revision)
