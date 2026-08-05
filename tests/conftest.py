from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from zzz_tracker.app import create_app
from zzz_tracker.config import Settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.tracker.service import TrackerService

FIXTURES_DIR = Path(__file__).parent / "fixtures"

TRACKED_UID = "1300000001"
UNKNOWN_UID = "1300000404"
RATE_LIMITED_UID = "1300000429"

ENKA_BASE_URL = "https://enka.test/api/zzz"


class FakeEnkaNetwork:
    """Enka.Network stand-in: serves recorded payloads and answers domain questions."""

    def __init__(self, profiles: dict[str, dict[str, Any]]) -> None:
        self._profiles = profiles
        self._requested_uids: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        uid = request.url.path.rsplit("/", 1)[-1]
        self._requested_uids.append(uid)
        if uid == RATE_LIMITED_UID:
            return httpx.Response(429, json={"detail": "too many requests"})
        payload = self._profiles.get(uid)
        if payload is None:
            return httpx.Response(404, json={"detail": "player does not exist"})
        return httpx.Response(200, json=payload)

    def as_client(self) -> EnkaClient:
        transport = httpx.MockTransport(self.handle)
        return EnkaClient(base_url=ENKA_BASE_URL, client=httpx.Client(transport=transport))

    def times_queried(self, uid: str) -> int:
        return self._requested_uids.count(uid)

    def was_queried(self) -> bool:
        return bool(self._requested_uids)

    def set_profile(self, uid: str, payload: dict[str, Any]) -> None:
        self._profiles[uid] = payload


@pytest.fixture
def enka_payload() -> dict[str, Any]:
    raw = (FIXTURES_DIR / "enka_profile.json").read_text(encoding="utf-8")
    payload: dict[str, Any] = json.loads(raw)
    return payload


@pytest.fixture
def static_data() -> StaticData:
    return StaticData.from_dir(FIXTURES_DIR / "static")


@pytest.fixture
def enka(enka_payload: dict[str, Any]) -> FakeEnkaNetwork:
    return FakeEnkaNetwork({TRACKED_UID: enka_payload})


@pytest.fixture
def enka_client(enka: FakeEnkaNetwork) -> Iterator[EnkaClient]:
    client = enka.as_client()
    yield client
    client.close()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path}/test.db",
        static_data_dir=str(FIXTURES_DIR / "static"),
        enka_base_url=ENKA_BASE_URL,
    )


@pytest.fixture
def db_manager(settings: Settings) -> DatabaseManager:
    manager = DatabaseManager(settings.database_url)
    manager.create_all()
    return manager


@pytest.fixture
def session(db_manager: DatabaseManager) -> Iterator[Session]:
    with db_manager.session_factory() as db_session:
        yield db_session


@pytest.fixture
def service(session: Session, enka_client: EnkaClient, static_data: StaticData) -> TrackerService:
    return TrackerService(session=session, enka=enka_client, static=static_data)


@pytest.fixture
def app(
    settings: Settings,
    db_manager: DatabaseManager,
    enka_client: EnkaClient,
    static_data: StaticData,
) -> FastAPI:
    application = create_app(settings, enka=enka_client, static=static_data)
    application.state.db = db_manager
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
