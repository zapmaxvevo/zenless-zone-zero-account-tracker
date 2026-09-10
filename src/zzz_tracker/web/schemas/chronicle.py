from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from zzz_tracker.storage.models import (
    ChallengeRun,
    ChallengeRunEntry,
    LostVoidProgress,
    as_utc,
)
from zzz_tracker.tracker.service import ChronicleImportReport
from zzz_tracker.web.schemas.common import RegionField


class ChallengeAgentRead(BaseModel):
    game_id: int
    level: int
    rarity: str
    element: str
    mindscape: int
    icon: str = ""


class ChallengeEntryRead(BaseModel):
    position: int
    layer_index: int | None
    layer_id: int | None
    name: str
    rating: str
    score: int
    max_score: int
    stars: int
    clear_time_seconds: int | None
    challenged_at: datetime | None
    boss_name: str
    boss_icon: str
    buffs: list[dict[str, Any]]
    agents: list[ChallengeAgentRead]
    bangboo_id: int | None

    @classmethod
    def from_entry(cls, entry: ChallengeRunEntry) -> ChallengeEntryRead:
        return cls(
            position=entry.position,
            layer_index=entry.layer_index,
            layer_id=entry.layer_id,
            name=entry.name,
            rating=entry.rating,
            score=entry.score,
            max_score=entry.max_score,
            stars=entry.stars,
            clear_time_seconds=entry.clear_time_seconds,
            challenged_at=as_utc(entry.challenged_at),
            boss_name=entry.boss_name,
            boss_icon=entry.boss_icon,
            buffs=[dict(buff) for buff in entry.buffs if isinstance(buff, dict)],
            agents=[
                ChallengeAgentRead(**agent) for agent in entry.agents if isinstance(agent, dict)
            ],
            bangboo_id=entry.bangboo_id,
        )


class ChallengeRunRead(BaseModel):
    id: int
    account_uid: str
    mode: str
    schedule_id: int
    begin_time: datetime | None
    end_time: datetime | None
    rating: str
    score: int
    max_score: int
    total_stars: int
    rank_percent: float | None
    clear_time_seconds: int | None
    schema_version: str
    synced_at: datetime | None
    entries: list[ChallengeEntryRead]

    @classmethod
    def from_run(cls, run: ChallengeRun) -> ChallengeRunRead:
        return cls(
            id=run.id,
            account_uid=run.account_uid,
            mode=run.mode,
            schedule_id=run.schedule_id,
            begin_time=as_utc(run.begin_time),
            end_time=as_utc(run.end_time),
            rating=run.rating,
            score=run.score,
            max_score=run.max_score,
            total_stars=run.total_stars,
            rank_percent=None if run.rank_percent is None else run.rank_percent / 100,
            clear_time_seconds=run.clear_time_seconds,
            schema_version=run.schema_version,
            synced_at=as_utc(run.synced_at),
            entries=[ChallengeEntryRead.from_entry(entry) for entry in run.entries],
        )


class ChallengeRunListResponse(BaseModel):
    items: list[ChallengeRunRead]


class BangbooRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    game_id: int
    name: str
    level: int
    rarity: int | None
    star: int
    icon: str


class BangbooListResponse(BaseModel):
    items: list[BangbooRead]


class LostVoidRead(BaseModel):
    account_uid: str
    license_level: int
    exploration_log: int
    max_exploration_log: int
    commissions_done: int
    commissions_total: int
    ultimate_challenge_score: int
    ultimate_challenge_tier: str
    data_collected: int
    synced_at: datetime | None

    @classmethod
    def from_progress(cls, progress: LostVoidProgress) -> LostVoidRead:
        return cls(
            account_uid=progress.account_uid,
            license_level=progress.license_level,
            exploration_log=progress.exploration_log,
            max_exploration_log=progress.max_exploration_log,
            commissions_done=progress.commissions_done,
            commissions_total=progress.commissions_total,
            ultimate_challenge_score=progress.ultimate_challenge_score,
            ultimate_challenge_tier=progress.ultimate_challenge_tier,
            data_collected=progress.data_collected,
            synced_at=as_utc(progress.synced_at),
        )


class ChronicleImportWrite(BaseModel):
    """A chronicle bundle captured in the user's browser: the raw `data` of each endpoint.

    Every key of `payloads` is optional except `index`, which confirms the UID; unknown keys
    anywhere are ignored so the extension can evolve ahead of the backend.
    """

    model_config = ConfigDict(extra="ignore")

    source: str = "extension"
    extension_version: str = ""
    captured_at: datetime | None = None
    region: RegionField = ""
    language: str = ""
    payloads: dict[str, Any]


class ChronicleImportResponse(BaseModel):
    """What an import stored, and the account key when the import is what claimed the UID.

    `account_key` is filled in exactly once per account: on the import that gave it an owner.
    """

    account_uid: str
    agents_synced: int
    bangboos_synced: int
    builds_synced: int
    lost_void_synced: bool
    unavailable_modes: list[str]
    skipped_sections: list[str]
    runs: list[ChallengeRunRead]
    account_key: str | None = None

    @classmethod
    def from_report(cls, report: ChronicleImportReport) -> ChronicleImportResponse:
        return cls(
            account_uid=report.account.uid,
            agents_synced=report.agents_synced,
            bangboos_synced=report.bangboos_synced,
            builds_synced=report.builds_synced,
            lost_void_synced=report.lost_void_synced,
            unavailable_modes=list(report.unavailable_modes),
            skipped_sections=list(report.skipped_sections),
            runs=[ChallengeRunRead.from_run(run) for run in report.runs],
            account_key=report.account_key,
        )
