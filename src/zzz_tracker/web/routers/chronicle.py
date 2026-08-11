from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from zzz_tracker.errors import NotFoundError
from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE
from zzz_tracker.web.deps import TrackerServiceDep
from zzz_tracker.web.schemas import (
    UID_PATTERN,
    BangbooListResponse,
    BangbooRead,
    ChallengeRunListResponse,
    ChallengeRunRead,
    ChronicleSyncResponse,
    CredentialRead,
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


@router.put("/{uid}/credentials", response_model=CredentialRead)
def store_credentials(
    uid: UidPath, payload: CredentialWrite, service: TrackerServiceDep
) -> CredentialRead:
    credential = service.store_credentials(uid, payload.ltuid_v2, payload.ltoken_v2)
    return CredentialRead.from_credential(credential)


@router.delete("/{uid}/credentials", status_code=status.HTTP_204_NO_CONTENT)
def delete_credentials(uid: UidPath, service: TrackerServiceDep) -> None:
    service.delete_credentials(uid)


@router.post("/{uid}/chronicle/sync", response_model=ChronicleSyncResponse)
def sync_chronicle(
    uid: UidPath,
    service: TrackerServiceDep,
    force: ForceQuery = False,
    previous: PreviousQuery = True,
) -> ChronicleSyncResponse:
    report = service.sync_chronicle(uid, force=force, include_previous=previous)
    return ChronicleSyncResponse.from_report(report)


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
