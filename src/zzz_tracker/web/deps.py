from __future__ import annotations

import secrets
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from zzz_tracker.config import Settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import (
    ImportDisabledError,
    StaticDataUnavailableError,
    UnauthorizedError,
)
from zzz_tracker.hoyolab.client import HoyolabClient
from zzz_tracker.storage.crypto import CredentialCipher
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


def get_required_static_data(
    static: Annotated[StaticData | None, Depends(get_static_data)],
) -> StaticData:
    if static is None:
        raise StaticDataUnavailableError(
            "The catalog needs Enka's static data; run `zzz-tracker sync-static` first"
        )
    return static


def get_hoyolab_client(request: Request) -> HoyolabClient:
    hoyolab: HoyolabClient = request.app.state.hoyolab
    return hoyolab


def get_credential_cipher(request: Request) -> CredentialCipher | None:
    cipher: CredentialCipher | None = request.app.state.cipher
    return cipher


def require_api_token(
    request: Request,
    authorization: Annotated[str, Header()] = "",
) -> None:
    token = get_app_settings(request).api_token
    if not token:
        raise ImportDisabledError("The chronicle import needs ZZZ_API_TOKEN to be set")
    scheme, _, given = authorization.partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(
        given.strip().encode(), token.encode()
    ):
        raise UnauthorizedError(
            "The chronicle import needs `Authorization: Bearer <ZZZ_API_TOKEN>`"
        )


def get_tracker_service(
    request: Request,
    session: Annotated[Session, Depends(get_db)],
    enka: Annotated[EnkaClient, Depends(get_enka_client)],
    static: Annotated[StaticData | None, Depends(get_static_data)],
    hoyolab: Annotated[HoyolabClient, Depends(get_hoyolab_client)],
    cipher: Annotated[CredentialCipher | None, Depends(get_credential_cipher)],
) -> TrackerService:
    settings = get_app_settings(request)
    return TrackerService(
        session=session,
        enka=enka,
        static=static,
        hoyolab=hoyolab,
        cipher=cipher,
        chronicle_ttl_seconds=settings.hoyolab_sync_ttl_seconds,
        chronicle_backoff_seconds=settings.hoyolab_backoff_seconds,
    )


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DatabaseManagerDep = Annotated[DatabaseManager, Depends(get_db_manager)]
SessionDep = Annotated[Session, Depends(get_db)]
EnkaClientDep = Annotated[EnkaClient, Depends(get_enka_client)]
HoyolabClientDep = Annotated[HoyolabClient, Depends(get_hoyolab_client)]
StaticDataDep = Annotated["StaticData | None", Depends(get_static_data)]
RequiredStaticDataDep = Annotated[StaticData, Depends(get_required_static_data)]
TrackerServiceDep = Annotated[TrackerService, Depends(get_tracker_service)]
