from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from zzz_tracker.web.deps import TrackerServiceDep
from zzz_tracker.web.schemas import (
    UID_PATTERN,
    AccountCreate,
    AccountCreatedRead,
    AccountListResponse,
    AccountRead,
    ClaimResponse,
)

router = APIRouter(prefix="/accounts", tags=["accounts"])

UidPath = Annotated[
    str, Path(pattern=UID_PATTERN, description="In-game UID of the tracked account")
]
ForceQuery = Annotated[bool, Query(description="Fetch even if Enka's ttl has not expired")]


@router.post("", response_model=AccountCreatedRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, service: TrackerServiceDep) -> AccountCreatedRead:
    """Track an account, importing whatever Enka exposes for its UID.

    Tracking a UID nobody owns claims it and answers with the key that writes it, shown
    this once. A UID that already has an owner is only refreshed, and `account_key` is null.
    """
    account, account_key = service.track_account(payload.uid)
    return AccountCreatedRead.from_claim(account, account_key)


@router.get("", response_model=AccountListResponse)
def list_accounts(service: TrackerServiceDep) -> AccountListResponse:
    accounts = service.list_accounts()
    return AccountListResponse(items=[AccountRead.from_account(item) for item in accounts])


@router.get("/{uid}", response_model=AccountRead)
def get_account(uid: UidPath, service: TrackerServiceDep) -> AccountRead:
    return AccountRead.from_account(service.get_account(uid))


@router.post("/{uid}/claim", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
def claim_account(uid: UidPath, service: TrackerServiceDep) -> ClaimResponse:
    """Take ownership of a tracked account nobody claimed, and read its key once.

    First come, first served: this proves nothing, it only hands the UID to whoever asked
    first. That is why a claim made here is `provisional` and an import that names the UID
    still outranks it — but only while it is provisional. Once an account is `verified`
    nothing takes it back except its key.
    """
    account_key = service.claim_account(uid)
    return ClaimResponse.from_claim(service.get_account(uid), account_key)


@router.post("/{uid}/sync", response_model=AccountRead)
def sync_account(
    uid: UidPath,
    service: TrackerServiceDep,
    force: ForceQuery = False,
) -> AccountRead:
    """Re-import from Enka. Without `force`, the fetch is skipped while the ttl holds."""
    service.get_account(uid)
    return AccountRead.from_account(service.sync_account(uid, force=force))
