from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from zzz_tracker.errors import (
    CaptchaRequiredError,
    ConflictError,
    DataNotPublicError,
    ExternalServiceError,
    ForbiddenError,
    InvalidCredentialsError,
    MissingCredentialsError,
    NotFoundError,
    RateLimitedError,
    StaticDataUnavailableError,
    UnauthorizedError,
    UnclaimedAccountError,
    ValidationError,
    ZZZTrackerError,
)

# The `code` of an error is API, not wording: a client branches on it, and two errors can
# share a status (409 is both `conflict` and `unclaimed_account`) while `detail` is free to
# be rewritten. Changing a code here is changing the contract — this table says so out loud.
ERROR_CONTRACT = [
    (ZZZTrackerError("something gave up"), 500, "internal_error"),
    (NotFoundError("no such account"), 404, "not_found"),
    (ConflictError("that agent is already tracked"), 409, "conflict"),
    (ValidationError("an agent cannot take two slots"), 422, "validation_error"),
    (ForbiddenError("this account has an owner"), 403, "forbidden"),
    (UnclaimedAccountError("claim it first"), 409, "unclaimed_account"),
    (UnauthorizedError("no bearer"), 401, "unauthorized"),
    (MissingCredentialsError("no cookies stored"), 401, "missing_credentials"),
    (InvalidCredentialsError("hoyolab said no"), 401, "invalid_credentials"),
    (DataNotPublicError("the chronicle is private"), 403, "data_not_public"),
    (StaticDataUnavailableError("run sync-static"), 503, "static_data_unavailable"),
    (ExternalServiceError("enka is down"), 502, "external_service_error"),
    (RateLimitedError("slow down"), 429, "rate_limited"),
    (CaptchaRequiredError("solve a captcha"), 503, "captcha_required"),
]


@pytest.mark.parametrize(("error", "status_code", "code"), ERROR_CONTRACT)
def test_domain_errors_answer_with_their_status_their_code_and_their_detail(
    app: FastAPI, error: Exception, status_code: int, code: str
) -> None:
    @app.get("/boom")
    def boom() -> None:
        raise error

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/boom")

    assert response.status_code == status_code
    assert response.json() == {"detail": str(error), "code": code}


def test_every_error_carries_a_code_of_its_own_so_none_of_them_collide() -> None:
    """Two errors answering the same status are only told apart by the code."""
    codes = [code for _, _, code in ERROR_CONTRACT]

    assert len(set(codes)) == len(codes)
    assert all(code.islower() and " " not in code for code in codes)
