from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from zzz_tracker.errors import (
    ConflictError,
    ExternalServiceError,
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
    StaticDataUnavailableError,
    UnclaimedAccountError,
    ValidationError,
)


@pytest.mark.parametrize(
    ("error", "status_code"),
    [
        (NotFoundError("no such account"), 404),
        (ConflictError("that agent is already tracked"), 409),
        (ForbiddenError("this account has an owner"), 403),
        (UnclaimedAccountError("claim it first"), 409),
        (ValidationError("an agent cannot take two slots"), 422),
        (StaticDataUnavailableError("run sync-static"), 503),
        (ExternalServiceError("enka is down"), 502),
        (RateLimitedError("slow down"), 429),
    ],
)
def test_domain_errors_map_to_http_responses(
    app: FastAPI, error: Exception, status_code: int
) -> None:
    @app.get("/boom")
    def boom() -> None:
        raise error

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/boom")

    assert response.status_code == status_code
    assert response.json() == {"detail": str(error)}
