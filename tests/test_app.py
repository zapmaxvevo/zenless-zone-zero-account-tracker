from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from zzz_tracker import __version__
from zzz_tracker.config import Settings

EXPECTED_ROUTES = {
    "/health",
    "/accounts",
    "/accounts/{uid}",
    "/accounts/{uid}/sync",
}


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "app": "ZZZ Tracker", "version": __version__}


def test_expected_routes_are_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()

    assert EXPECTED_ROUTES.issubset(schema["paths"])


def test_cors_preflight_from_an_extension_is_accepted(client: TestClient) -> None:
    response = client.options(
        "/accounts/123/chronicle/import",
        headers={
            "Origin": "moz-extension://0000-1111",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_app_state_holds_settings_and_collaborators(app: FastAPI, settings: Settings) -> None:
    assert app.state.settings is settings
    assert app.state.db.database_url == settings.database_url
    assert app.state.enka is not None
    assert app.state.static is not None
