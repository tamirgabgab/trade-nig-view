"""RFC 9457 ``application/problem+json`` error responses.

Every error leaving the API has the shape::

    {"type": "about:blank", "title": "Not Found", "status": 404, "detail": "...",
     "instance": "/api/...", "code": "not_found"}
"""

from __future__ import annotations

import logging
import uuid
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_JSON = "application/problem+json"

logger = logging.getLogger(__name__)


class ChartLabError(Exception):
    """Base class for domain errors that map to a problem+json response."""

    status: int = HTTPStatus.INTERNAL_SERVER_ERROR
    code: str = "internal_error"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class SymbolNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "symbol_not_found"


class SeriesNotFoundError(ChartLabError):
    status = HTTPStatus.NOT_FOUND
    code = "series_not_found"


class RevisionConflictError(ChartLabError):
    """The client saved on top of an older revision (another tab or window saved meanwhile)."""

    status = HTTPStatus.CONFLICT
    code = "revision_conflict"


class DataUnavailableError(ChartLabError):
    """No provider could deliver data and nothing is cached."""

    status = HTTPStatus.SERVICE_UNAVAILABLE
    code = "data_unavailable"


def problem(
    request: Request,
    status: int,
    detail: str,
    code: str,
    **extra: object,
) -> JSONResponse:
    """Build a problem+json response for ``request``."""
    body: dict[str, object] = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "detail": detail,
        "instance": request.url.path,
        "code": code,
        **extra,
    }
    return JSONResponse(body, status_code=status, media_type=PROBLEM_JSON)


def _code_for_status(status: int) -> str:
    return HTTPStatus(status).phrase.lower().replace(" ", "_").replace("-", "_")


async def _handle_domain(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ChartLabError)  # noqa: S101 - registered for this type only
    return problem(request, exc.status, exc.detail, exc.code)


async def _handle_http(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101 - registered for this type only
    return problem(request, exc.status_code, str(exc.detail), _code_for_status(exc.status_code))


async def _handle_validation(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101 - registered for this type only
    errors = [
        {"loc": list(err.get("loc", ())), "msg": err.get("msg", ""), "type": err.get("type", "")}
        for err in exc.errors()
    ]
    return problem(
        request,
        HTTPStatus.UNPROCESSABLE_ENTITY,
        "Request validation failed",
        "validation_error",
        errors=errors,
    )


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    correlation_id = uuid.uuid4().hex
    logger.exception("Unhandled error (correlation_id=%s)", correlation_id, exc_info=exc)
    return problem(
        request,
        HTTPStatus.INTERNAL_SERVER_ERROR,
        "Unexpected server error",
        "internal_error",
        correlation_id=correlation_id,
    )


def register_error_handlers(app: FastAPI) -> None:
    """Install the problem+json handlers on ``app``."""
    app.add_exception_handler(ChartLabError, _handle_domain)
    app.add_exception_handler(StarletteHTTPException, _handle_http)
    app.add_exception_handler(RequestValidationError, _handle_validation)
    app.add_exception_handler(Exception, _handle_unexpected)
