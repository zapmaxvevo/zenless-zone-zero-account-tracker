from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from zzz_tracker import __version__
from zzz_tracker.config import Settings

EXPECTED_ROUTES = {"/health"}


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "app": "ZZZ Tracker", "version": __version__}


def test_expected_routes_are_registered(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()

    assert EXPECTED_ROUTES.issubset(schema["paths"])


def test_app_state_holds_settings_and_database(app: FastAPI, settings: Settings) -> None:
    assert app.state.settings is settings
    assert app.state.db.database_url == settings.database_url


def test_database_manager_creates_schema(app: FastAPI) -> None:
    app.state.db.create_all()

    with app.state.db.session_factory() as session:
        assert session.is_active
