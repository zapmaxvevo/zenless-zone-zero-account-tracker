from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from zzz_tracker.web.deps import TrackerServiceDep
from zzz_tracker.web.schemas import (
    UID_PATTERN,
    AccountCreate,
    AccountListResponse,
    AccountRead,
)

router = APIRouter(prefix="/accounts", tags=["accounts"])

UidPath = Annotated[
    str, Path(pattern=UID_PATTERN, description="In-game UID of the tracked account")
]
ForceQuery = Annotated[bool, Query(description="Fetch even if Enka's ttl has not expired")]


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, service: TrackerServiceDep) -> AccountRead:
    """Track an account, importing whatever Enka exposes for its UID."""
    account = service.sync_account(payload.uid)
    return AccountRead.from_account(account)


@router.get("", response_model=AccountListResponse)
def list_accounts(service: TrackerServiceDep) -> AccountListResponse:
    accounts = service.list_accounts()
    return AccountListResponse(items=[AccountRead.from_account(item) for item in accounts])


@router.get("/{uid}", response_model=AccountRead)
def get_account(uid: UidPath, service: TrackerServiceDep) -> AccountRead:
    return AccountRead.from_account(service.get_account(uid))


@router.post("/{uid}/sync", response_model=AccountRead)
def sync_account(
    uid: UidPath,
    service: TrackerServiceDep,
    force: ForceQuery = False,
) -> AccountRead:
    """Re-import from Enka. Without `force`, the fetch is skipped while the ttl holds."""
    service.get_account(uid)
    return AccountRead.from_account(service.sync_account(uid, force=force))
