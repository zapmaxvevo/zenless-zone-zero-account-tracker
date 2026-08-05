from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from zzz_tracker.config import Settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.tracker.service import TrackerService


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_db_manager(request: Request) -> DatabaseManager:
    db: DatabaseManager = request.app.state.db
    return db


def get_db(request: Request) -> Generator[Session, None, None]:
    session_factory = get_db_manager(request).session_factory
    with session_factory() as session:
        yield session


def get_enka_client(request: Request) -> EnkaClient:
    enka: EnkaClient = request.app.state.enka
    return enka


def get_static_data(request: Request) -> StaticData | None:
    static: StaticData | None = request.app.state.static
    return static


def get_tracker_service(
    session: Annotated[Session, Depends(get_db)],
    enka: Annotated[EnkaClient, Depends(get_enka_client)],
    static: Annotated[StaticData | None, Depends(get_static_data)],
) -> TrackerService:
    return TrackerService(session=session, enka=enka, static=static)


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DatabaseManagerDep = Annotated[DatabaseManager, Depends(get_db_manager)]
SessionDep = Annotated[Session, Depends(get_db)]
EnkaClientDep = Annotated[EnkaClient, Depends(get_enka_client)]
StaticDataDep = Annotated["StaticData | None", Depends(get_static_data)]
TrackerServiceDep = Annotated[TrackerService, Depends(get_tracker_service)]
