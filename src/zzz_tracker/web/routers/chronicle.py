from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from zzz_tracker.errors import NotFoundError
from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE
from zzz_tracker.web.deps import (
    AccountKeyHeader,
    TrackerServiceDep,
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

    The only way HoYoLAB data reaches this backend, and the only way an account gets an
    owner. A bundle proves nothing on its own — the client picks every byte of it, the UID
    it names included, and a UID is public — so it goes through without a key only where
    nothing can be taken: an account nobody owns yet, which it then claims, answering with
    the key once. Against an account that has an owner it takes that owner's key, and
    answers 403 without it; the way back in from a lost key is `zzz-tracker rotate-key` on
    the machine that holds the database.
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
