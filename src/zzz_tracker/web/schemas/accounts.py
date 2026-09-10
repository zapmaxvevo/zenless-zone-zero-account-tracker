from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from zzz_tracker.storage.models import Account, as_utc, region_for_uid
from zzz_tracker.web.schemas.common import UID_PATTERN


class AccountCreate(BaseModel):
    uid: str = Field(pattern=UID_PATTERN, description="In-game UID of the account to track")


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uid: str
    nickname: str
    level: int
    signature: str
    profile_id: int | None
    avatar_id: int | None
    title_id: int | None
    calling_card_id: int | None
    last_synced_at: datetime | None
    next_sync_available_at: datetime | None
    region: str
    chronicle_public: bool
    chronicle_synced_at: datetime | None
    chronicle_import_source: str | None
    has_owner: bool
    agent_count: int

    @classmethod
    def from_account(cls, account: Account) -> AccountRead:
        return cls(
            uid=account.uid,
            nickname=account.nickname,
            level=account.level,
            signature=account.signature,
            profile_id=account.profile_id,
            avatar_id=account.avatar_id,
            title_id=account.title_id,
            calling_card_id=account.calling_card_id,
            last_synced_at=as_utc(account.last_synced_at),
            next_sync_available_at=account.next_sync_available_at(),
            region=account.region or region_for_uid(account.uid),
            chronicle_public=account.chronicle_public,
            chronicle_synced_at=as_utc(account.chronicle_synced_at),
            chronicle_import_source=account.chronicle_import_source,
            has_owner=account.is_claimed,
            agent_count=len(account.agents),
        )


class AccountListResponse(BaseModel):
    items: list[AccountRead]
