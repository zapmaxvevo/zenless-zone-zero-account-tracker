from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status

from zzz_tracker.web.deps import TrackerServiceDep, UidPath, require_account_key
from zzz_tracker.web.schemas import (
    AccountCreate,
    AccountListResponse,
    AccountRead,
    ErrorResponse,
)

router = APIRouter(prefix="/accounts", tags=["accounts"])

ForceQuery = Annotated[bool, Query(description="Fetch even if Enka's ttl has not expired")]

OWNERSHIP_ERRORS: dict[int | str, dict[str, Any]] = {
    403: {"model": ErrorResponse, "description": "The key is missing, or belongs elsewhere"},
    404: {"model": ErrorResponse, "description": "The account is not tracked"},
    409: {"model": ErrorResponse, "description": "The account has no owner yet"},
}


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, service: TrackerServiceDep) -> AccountRead:
    """Track an account, importing whatever Enka exposes for its UID."""
    return AccountRead.from_account(service.sync_account(payload.uid))


@router.get("", response_model=AccountListResponse)
def list_accounts(service: TrackerServiceDep) -> AccountListResponse:
    accounts = service.list_accounts()
    return AccountListResponse(items=[AccountRead.from_account(item) for item in accounts])


@router.get("/{uid}", response_model=AccountRead)
def get_account(uid: UidPath, service: TrackerServiceDep) -> AccountRead:
    return AccountRead.from_account(service.get_account(uid))


@router.get(
    "/{uid}/ownership",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=OWNERSHIP_ERRORS,
    dependencies=[Depends(require_account_key)],
)
def check_ownership(uid: UidPath) -> Response:
    """Ask whether the key you hold is the one that owns this account, changing nothing.

    The key never comes back, in whole or in part: the status *is* the answer.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{uid}/sync", response_model=AccountRead)
def sync_account(
    uid: UidPath,
    service: TrackerServiceDep,
    force: ForceQuery = False,
) -> AccountRead:
    """Re-import from Enka. Without `force`, the fetch is skipped while the ttl holds."""
    service.get_account(uid)
    return AccountRead.from_account(service.sync_account(uid, force=force))
