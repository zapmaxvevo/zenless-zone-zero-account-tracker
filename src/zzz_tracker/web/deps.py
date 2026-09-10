from __future__ import annotations

import secrets
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, Header, Path, Request
from sqlalchemy.orm import Session

from zzz_tracker.config import Settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import (
    ForbiddenError,
    StaticDataUnavailableError,
    UnauthorizedError,
    UnclaimedAccountError,
)
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.tracker.service import TrackerService
from zzz_tracker.web.schemas import UID_PATTERN


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


def require_api_token(
    request: Request,
    authorization: Annotated[str, Header()] = "",
) -> None:
    """Ask for the shared token, but only where one was configured. It is not ownership."""
    token = get_app_settings(request).api_token
    if not token:
        return
    scheme, _, given = authorization.partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(
        given.strip().encode(), token.encode()
    ):
        raise UnauthorizedError(
            "The chronicle import needs `Authorization: Bearer <ZZZ_API_TOKEN>`"
        )


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
RequiredStaticDataDep = Annotated[StaticData, Depends(get_required_static_data)]
TrackerServiceDep = Annotated[TrackerService, Depends(get_tracker_service)]


# A guard must describe its path parameter exactly as the endpoint does, or it relaxes it.
UidPath = Annotated[
    str, Path(pattern=UID_PATTERN, description="In-game UID of the tracked account")
]
AgentIdPath = Annotated[int, Path(ge=1, description="Tracked agent id")]
TeamIdPath = Annotated[int, Path(ge=1, description="Team id")]
AccountKeyHeader = Annotated[
    str,
    Header(
        alias="X-Account-Key",
        description="The key handed out when the account was claimed; writes need it",
    ),
]


def _check_account_key(service: TrackerService, uid: str, given: str) -> None:
    """Let the write through only for whoever holds the key of *that* account."""
    account = service.get_account(uid)
    if not account.is_claimed:
        raise UnclaimedAccountError(
            f"Account {uid} has no owner yet, so nothing may write to it; import its "
            "chronicle with the browser extension to claim it and get its key"
        )
    if not service.verify_key(uid, given):
        raise ForbiddenError(
            f"Account {uid} belongs to whoever holds its key; "
            "this write needs that key in `X-Account-Key`"
        )


def require_account_key(
    uid: UidPath, service: TrackerServiceDep, x_account_key: AccountKeyHeader = ""
) -> None:
    """Guard a write whose account is named in the path."""
    _check_account_key(service, uid, x_account_key)


def require_agent_owner_key(
    agent_id: AgentIdPath, service: TrackerServiceDep, x_account_key: AccountKeyHeader = ""
) -> None:
    """Guard a write on an agent, whose account only the row itself knows."""
    _check_account_key(service, service.account_uid_for_agent(agent_id), x_account_key)


def require_team_owner_key(
    team_id: TeamIdPath, service: TrackerServiceDep, x_account_key: AccountKeyHeader = ""
) -> None:
    """Same as `require_agent_owner_key`, for the team ids that are just as global."""
    _check_account_key(service, service.account_uid_for_team(team_id), x_account_key)
