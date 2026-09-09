from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from zzz_tracker.errors import NotFoundError
from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE
from zzz_tracker.web.deps import (
    AccountKeyHeader,
    TrackerServiceDep,
    require_account_key,
    require_api_token,
)
from zzz_tracker.web.schemas import (
    UID_PATTERN,
    BangbooListResponse,
    BangbooRead,
    ChallengeRunListResponse,
    ChallengeRunRead,
    ChronicleImportResponse,
    ChronicleImportWrite,
    ChronicleSyncResponse,
    CredentialRead,
    CredentialStatusRead,
    CredentialWrite,
    LostVoidRead,
)

router = APIRouter(prefix="/accounts", tags=["chronicle"])

UidPath = Annotated[
    str, Path(pattern=UID_PATTERN, description="In-game UID of the tracked account")
]
ModeQuery = Annotated[
    str | None,
    Query(description=f"Filter by mode: `{MODE_SHIYU_DEFENSE}` or `{MODE_DEADLY_ASSAULT}`"),
]
ForceQuery = Annotated[bool, Query(description="Sync even if the chronicle ttl has not expired")]
PreviousQuery = Annotated[bool, Query(description="Also fetch the previous season")]


@router.get("/{uid}/credentials", response_model=CredentialStatusRead)
def get_credentials_status(uid: UidPath, service: TrackerServiceDep) -> CredentialStatusRead:
    """Whether the account is connected to HoYoLAB, without saying anything the cookies say.

    Public, like every other read: that an account has cookies stored is already in
    `has_hoyolab_credentials` on the account itself. What is never public — the ltoken, the
    ltuid, anything decrypted — is not here either. An account with nothing stored answers
    `stored: false` rather than 404, which is the question the frontend is really asking.
    """
    account = service.get_account(uid)
    return CredentialStatusRead.from_credential(account.uid, account.credential)


@router.put(
    "/{uid}/credentials",
    response_model=CredentialRead,
    dependencies=[Depends(require_account_key)],
)
def store_credentials(
    uid: UidPath, payload: CredentialWrite, service: TrackerServiceDep
) -> CredentialRead:
    credential = service.store_credentials(uid, payload.ltuid_v2, payload.ltoken_v2)
    return CredentialRead.from_credential(credential)


@router.delete(
    "/{uid}/credentials",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_account_key)],
)
def delete_credentials(uid: UidPath, service: TrackerServiceDep) -> None:
    service.delete_credentials(uid)


@router.post(
    "/{uid}/chronicle/sync",
    response_model=ChronicleSyncResponse,
    dependencies=[Depends(require_account_key)],
)
def sync_chronicle(
    uid: UidPath,
    service: TrackerServiceDep,
    force: ForceQuery = False,
    previous: PreviousQuery = True,
) -> ChronicleSyncResponse:
    report = service.sync_chronicle(uid, force=force, include_previous=previous)
    return ChronicleSyncResponse.from_report(report)


@router.post(
    "/{uid}/chronicle/import",
    response_model=ChronicleImportResponse,
    dependencies=[Depends(require_api_token)],
)
def import_chronicle(
    uid: UidPath,
    payload: ChronicleImportWrite,
    service: TrackerServiceDep,
    x_account_key: AccountKeyHeader = "",
) -> ChronicleImportResponse:
    """Store a chronicle bundle captured in the browser, tracking the account if it is new.

    This is the one write that needs no key: the bundle *is* the proof, since only the
    HoYoLAB session of that UID can produce one. Sending the key in force keeps it; sending
    none, or a stale one, rotates the account onto a new key that comes back in the answer.
    """
    report = service.import_chronicle(
        uid, payload.payloads, region=payload.region, account_key=x_account_key
    )
    return ChronicleImportResponse.from_report(report)


@router.get("/{uid}/challenges", response_model=ChallengeRunListResponse)
def list_challenges(
    uid: UidPath, service: TrackerServiceDep, mode: ModeQuery = None
) -> ChallengeRunListResponse:
    runs = service.list_challenge_runs(uid, mode=mode)
    return ChallengeRunListResponse(items=[ChallengeRunRead.from_run(run) for run in runs])


@router.get("/{uid}/bangboos", response_model=BangbooListResponse)
def list_bangboos(uid: UidPath, service: TrackerServiceDep) -> BangbooListResponse:
    bangboos = service.list_bangboos(uid)
    return BangbooListResponse(items=[BangbooRead.model_validate(bangboo) for bangboo in bangboos])


@router.get("/{uid}/lost-void", response_model=LostVoidRead)
def get_lost_void(uid: UidPath, service: TrackerServiceDep) -> LostVoidRead:
    progress = service.find_lost_void(uid)
    if progress is None:
        raise NotFoundError(f"Account {uid} has no Lost Void progress synced yet")
    return LostVoidRead.from_progress(progress)
