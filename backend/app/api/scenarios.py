"""``/api/planner/scenarios`` - named, saved planner scenarios (Phase H, H4).

A scenario is the planner's whole state as the page holds it (both options' forms, what each
option contains, the comparison's settings). The backend stores it as it is and gives it back
as it was: the page owns its shape and its ``version``.
"""

from __future__ import annotations

import json
from http import HTTPStatus
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_scenarios
from app.errors import ChartLabError
from app.models.layouts import DocumentName
from app.storage.documents import SCHEMA_VERSION, DocumentStore

router = APIRouter(tags=["planner"])

#: The largest state kept, as JSON text (a scenario with every table filled is about 10 kB).
MAX_STATE_BYTES = 256_000
_CONFLICT: dict[int | str, dict[str, Any]] = {
    409: {"description": "Saved meanwhile elsewhere: reload (problem+json)"}
}
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"description": "No scenario with this name (problem+json)"}
}


class ScenarioNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "scenario_not_found"


class ScenarioUpdate(BaseModel):
    """``PUT`` body: the whole state, and the revision it was based on (optimistic locking)."""

    revision: int = Field(ge=0, description="Revision the client last read; 0 = create")
    state: dict[str, Any] = Field(min_length=1, description="The planner's state, kept as it is")

    @field_validator("state")
    @classmethod
    def _small(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value)) > MAX_STATE_BYTES:
            raise ValueError(f"the scenario is too large (over {MAX_STATE_BYTES} bytes)")
        return value


class ScenarioSummary(BaseModel):
    name: str
    revision: int
    updated_at: str


class ScenarioDocument(ScenarioSummary):
    state: dict[str, Any]


class ScenarioList(BaseModel):
    scenarios: list[ScenarioSummary] = Field(description="Newest first")


@router.get("/planner/scenarios", response_model=ScenarioList)
def list_scenarios(store: Annotated[DocumentStore, Depends(get_scenarios)]) -> ScenarioList:
    """Every saved scenario, newest first, without its state."""
    return ScenarioList(
        scenarios=[
            ScenarioSummary(name=name, revision=revision, updated_at=updated_at)
            for name, revision, updated_at, _ in store.list()
        ]
    )


@router.get("/planner/scenarios/{name}", response_model=ScenarioDocument, responses=_NOT_FOUND)
def get_scenario(
    name: DocumentName, store: Annotated[DocumentStore, Depends(get_scenarios)]
) -> ScenarioDocument:
    """One saved scenario."""
    found = store.get(name)
    if found is None:
        raise ScenarioNotFoundError(f"No scenario named {name!r}")
    revision, document, updated_at = found
    return ScenarioDocument.model_validate(
        {"name": name, "revision": revision, "updated_at": updated_at, "state": document["state"]}
    )


@router.put("/planner/scenarios/{name}", response_model=ScenarioDocument, responses=_CONFLICT)
def put_scenario(
    name: DocumentName,
    body: ScenarioUpdate,
    store: Annotated[DocumentStore, Depends(get_scenarios)],
) -> ScenarioDocument:
    """Create (``revision`` 0) or replace a scenario; a stale ``revision`` is a 409."""
    revision, updated_at = store.put(
        name, body.revision, {"schema_version": SCHEMA_VERSION, "state": body.state}
    )
    return ScenarioDocument(name=name, revision=revision, updated_at=updated_at, state=body.state)


@router.delete(
    "/planner/scenarios/{name}",
    status_code=HTTPStatus.NO_CONTENT,
    response_class=Response,
    responses={**_NOT_FOUND, **_CONFLICT},
)
def delete_scenario(
    name: DocumentName,
    revision: Annotated[int, Query(ge=0, description="Revision the client last read")],
    store: Annotated[DocumentStore, Depends(get_scenarios)],
) -> None:
    """Delete a scenario; a stale ``revision`` is a 409."""
    store.delete(name, revision)
