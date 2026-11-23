"""``GET /api/learn/{slug}``: an indicator's learn page (Markdown with LaTeX math)."""

from __future__ import annotations

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.errors import ChartLabError
from app.indicators.catalog import CATALOG

router = APIRouter(tags=["learn"])


class LearnPageNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "learn_page_not_found"


class LearnPage(BaseModel):
    slug: str
    markdown: str


@router.get("/learn/{slug}", response_model=LearnPage)
def learn_page(slug: str, settings: Annotated[Settings, Depends(get_settings)]) -> LearnPage:
    """The page of a registered indicator's ``learn_slug`` (only those: no path is built from
    arbitrary input)."""
    if slug not in {spec.learn_slug for spec in CATALOG.values()}:
        raise LearnPageNotFoundError(f"No learn page '{slug}'")
    path = settings.learn_dir / f"{slug}.md"
    if not path.is_file():
        raise LearnPageNotFoundError(f"Learn page '{slug}' is missing")
    return LearnPage(slug=slug, markdown=path.read_text(encoding="utf-8"))
