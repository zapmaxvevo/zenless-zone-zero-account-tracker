from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ZZZTrackerError(Exception):
    """Base class for domain errors raised by the tracker."""

    status_code = 500
    default_detail = "Internal error"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.default_detail
        super().__init__(self.detail)


class NotFoundError(ZZZTrackerError):
    status_code = 404
    default_detail = "Resource not found"


class ConflictError(ZZZTrackerError):
    status_code = 409
    default_detail = "The resource already exists"


class ValidationError(ZZZTrackerError):
    """A request that is well-formed but breaks a rule only the domain can check."""

    status_code = 422
    default_detail = "The request breaks a domain rule"


class StaticDataUnavailableError(ZZZTrackerError):
    status_code = 503
    default_detail = "Enka's static data has not been downloaded yet"


class ExternalServiceError(ZZZTrackerError):
    status_code = 502
    default_detail = "Upstream service failed"


class RateLimitedError(ExternalServiceError):
    status_code = 429
    default_detail = "Upstream service rate limited the request"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ZZZTrackerError)
    async def handle_tracker_error(request: Request, exc: Exception) -> JSONResponse:
        error = exc if isinstance(exc, ZZZTrackerError) else ZZZTrackerError()
        return JSONResponse(status_code=error.status_code, content={"detail": error.detail})
