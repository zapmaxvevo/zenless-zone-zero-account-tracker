from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ZZZTrackerError(Exception):
    """Base class for domain errors raised by the tracker.

    `code` is the half of the answer meant for a program and `detail` the half meant for a
    person. A client branches on the code, never on the words: the wording is free to change
    with no notice, and a status alone does not say enough — 409 is both "that agent is
    already tracked" and "this account has no owner yet". Codes are part of the API, so
    renaming one is a breaking change and `tests/test_errors.py` pins every one of them.
    """

    status_code = 500
    code = "internal_error"
    default_detail = "Internal error"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.default_detail
        super().__init__(self.detail)


class NotFoundError(ZZZTrackerError):
    status_code = 404
    code = "not_found"
    default_detail = "Resource not found"


class ConflictError(ZZZTrackerError):
    status_code = 409
    code = "conflict"
    default_detail = "The resource already exists"


class ValidationError(ZZZTrackerError):
    """A request that is well-formed but breaks a rule only the domain can check."""

    status_code = 422
    code = "validation_error"
    default_detail = "The request breaks a domain rule"


class StaticDataUnavailableError(ZZZTrackerError):
    status_code = 503
    code = "static_data_unavailable"
    default_detail = "Enka's static data has not been downloaded yet"


class ExternalServiceError(ZZZTrackerError):
    status_code = 502
    code = "external_service_error"
    default_detail = "Upstream service failed"


class RateLimitedError(ExternalServiceError):
    status_code = 429
    code = "rate_limited"
    default_detail = "Upstream service rate limited the request"


class MissingCredentialsError(ZZZTrackerError):
    status_code = 401
    code = "missing_credentials"
    default_detail = "The account has no HoYoLAB credentials stored"


class InvalidCredentialsError(ZZZTrackerError):
    status_code = 401
    code = "invalid_credentials"
    default_detail = "HoYoLAB rejected the stored credentials"


class DataNotPublicError(ZZZTrackerError):
    status_code = 403
    code = "data_not_public"
    default_detail = "That player keeps their Battle Chronicle private"


class CaptchaRequiredError(ExternalServiceError):
    status_code = 503
    code = "captcha_required"
    default_detail = "HoYoLAB is asking for a captcha; try again later"


class UnauthorizedError(ZZZTrackerError):
    status_code = 401
    code = "unauthorized"
    default_detail = "The request is missing a valid API token"


class ImportDisabledError(ZZZTrackerError):
    status_code = 503
    code = "import_disabled"
    default_detail = "The import endpoint is disabled until ZZZ_API_TOKEN is set"


class ForbiddenError(ZZZTrackerError):
    """Someone tried to write an account without the key that owns it."""

    status_code = 403
    code = "forbidden"
    default_detail = "This account has an owner; the write needs its `X-Account-Key`"


class UnclaimedAccountError(ZZZTrackerError):
    """The account exists but nobody owns it yet, so there is no key that could write it."""

    status_code = 409
    code = "unclaimed_account"
    default_detail = "Claim the account before writing to it"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ZZZTrackerError)
    async def handle_tracker_error(request: Request, exc: Exception) -> JSONResponse:
        error = exc if isinstance(exc, ZZZTrackerError) else ZZZTrackerError()
        return JSONResponse(
            status_code=error.status_code,
            content={"detail": error.detail, "code": error.code},
        )
