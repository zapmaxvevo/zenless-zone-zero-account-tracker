from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

SOURCE_ENKA = "enka"
SOURCE_MANUAL = "manual"
SOURCE_HOYOLAB = "hoyolab"

CHRONICLE_SOURCE_EXTENSION = "extension"

MODE_SHIYU_DEFENSE = "shiyu_defense"
MODE_DEADLY_ASSAULT = "deadly_assault"

REGIONS_BY_UID_PREFIX = {
    "10": "prod_gf_us",
    "13": "prod_gf_jp",
    "15": "prod_gf_eu",
    "17": "prod_gf_sg",
}
DEFAULT_REGION = "prod_gf_eu"
CHINA_REGION = "prod_gf_cn"
# Every region HoYoLAB actually serves. An import names its own region in the body, so what
# it says is checked against this before it is believed: the region is stored on the account
# and served with it, and a made-up one would sit there being read as fact.
KNOWN_REGIONS = frozenset(REGIONS_BY_UID_PREFIX.values()) | {DEFAULT_REGION, CHINA_REGION}


def region_for_uid(uid: str) -> str:
    digits = uid.strip()
    if len(digits) == 8:
        return CHINA_REGION
    return REGIONS_BY_UID_PREFIX.get(digits[:2], DEFAULT_REGION)


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


def utc_now() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime | None) -> datetime | None:
    """Re-attach UTC to the naive datetimes SQLite hands back."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


class Account(Base):
    __tablename__ = "accounts"

    uid: Mapped[str] = mapped_column(String(16), primary_key=True)
    nickname: Mapped[str] = mapped_column(String(64), default="")
    level: Mapped[int] = mapped_column(Integer, default=0)
    signature: Mapped[str] = mapped_column(Text, default="")
    profile_id: Mapped[int | None] = mapped_column(Integer, default=None)
    avatar_id: Mapped[int | None] = mapped_column(Integer, default=None)
    title_id: Mapped[int | None] = mapped_column(Integer, default=None)
    calling_card_id: Mapped[int | None] = mapped_column(Integer, default=None)

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    sync_ttl_seconds: Mapped[int] = mapped_column(Integer, default=0)

    region: Mapped[str] = mapped_column(String(16), default="")
    chronicle_public: Mapped[bool] = mapped_column(Boolean, default=False)
    chronicle_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    chronicle_import_source: Mapped[str | None] = mapped_column(String(16), default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    agents: Mapped[list[Agent]] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
        order_by="Agent.game_id",
    )
    teams: Mapped[list[Team]] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
        order_by="Team.id",
    )
    bangboos: Mapped[list[Bangboo]] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
        order_by="Bangboo.game_id",
    )
    key: Mapped[AccountKey | None] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
        uselist=False,
    )
    challenge_runs: Mapped[list[ChallengeRun]] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
        order_by="ChallengeRun.schedule_id.desc()",
    )

    @property
    def is_claimed(self) -> bool:
        """Whether anybody holds the key of this account. Nobody, at first, and for ever."""
        return self.key is not None

    def next_sync_available_at(self) -> datetime | None:
        """When Enka is expected to serve fresh data again; None if never synced."""
        synced_at = as_utc(self.last_synced_at)
        if synced_at is None:
            return None
        return synced_at + timedelta(seconds=self.sync_ttl_seconds)

    def is_sync_due(self, now: datetime | None = None) -> bool:
        next_sync = self.next_sync_available_at()
        if next_sync is None:
            return True
        return (now or utc_now()) >= next_sync


class AccountKey(Base):
    """The hashed write key of one account.

    One row per account, holding a secret that is never read back: the row existing is what
    "this account has an owner" means. Only the first import of a UID creates one — after
    that the key is the only thing that speaks for the account — so `rotated_at` marks the
    deliberate reissues, which only happen from the CLI.
    """

    __tablename__ = "account_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), unique=True, index=True
    )
    key_hash: Mapped[str] = mapped_column(String(64))

    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    account: Mapped[Account] = relationship(back_populates="key")


class Bangboo(Base):
    __tablename__ = "bangboos"
    __table_args__ = (UniqueConstraint("account_uid", "game_id", name="uq_bangboos_account_game"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), index=True
    )
    game_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(64), default="")
    level: Mapped[int] = mapped_column(Integer, default=1)
    rarity: Mapped[int | None] = mapped_column(Integer, default=None)
    star: Mapped[int] = mapped_column(Integer, default=0)
    icon: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    account: Mapped[Account] = relationship(back_populates="bangboos")


class ChallengeRun(Base):
    __tablename__ = "challenge_runs"
    __table_args__ = (
        UniqueConstraint("account_uid", "mode", "schedule_id", name="uq_challenge_runs_season"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), index=True
    )
    mode: Mapped[str] = mapped_column(String(32), index=True)
    schedule_id: Mapped[int] = mapped_column(Integer)

    begin_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    has_data: Mapped[bool] = mapped_column(Boolean, default=False)

    rating: Mapped[str] = mapped_column(String(4), default="")
    score: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=0)
    total_stars: Mapped[int] = mapped_column(Integer, default=0)
    rank_percent: Mapped[int | None] = mapped_column(Integer, default=None)
    clear_time_seconds: Mapped[int | None] = mapped_column(Integer, default=None)
    schema_version: Mapped[str] = mapped_column(String(8), default="")

    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    account: Mapped[Account] = relationship(back_populates="challenge_runs")
    entries: Mapped[list[ChallengeRunEntry]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="ChallengeRunEntry.position",
    )


class ChallengeRunEntry(Base):
    __tablename__ = "challenge_run_entries"
    __table_args__ = (
        UniqueConstraint("run_id", "position", name="uq_challenge_run_entries_position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("challenge_runs.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    layer_index: Mapped[int | None] = mapped_column(Integer, default=None)
    layer_id: Mapped[int | None] = mapped_column(Integer, default=None)

    name: Mapped[str] = mapped_column(String(128), default="")
    rating: Mapped[str] = mapped_column(String(4), default="")
    score: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=0)
    stars: Mapped[int] = mapped_column(Integer, default=0)
    clear_time_seconds: Mapped[int | None] = mapped_column(Integer, default=None)
    challenged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    boss_name: Mapped[str] = mapped_column(String(128), default="")
    boss_icon: Mapped[str] = mapped_column(Text, default="")
    buffs: Mapped[list[Any]] = mapped_column(JSON, default=list)
    agents: Mapped[list[Any]] = mapped_column(JSON, default=list)
    bangboo_id: Mapped[int | None] = mapped_column(Integer, default=None)

    run: Mapped[ChallengeRun] = relationship(back_populates="entries")


class LostVoidProgress(Base):
    __tablename__ = "lost_void_progress"

    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), primary_key=True
    )
    license_level: Mapped[int] = mapped_column(Integer, default=0)
    exploration_log: Mapped[int] = mapped_column(Integer, default=0)
    max_exploration_log: Mapped[int] = mapped_column(Integer, default=0)
    commissions_done: Mapped[int] = mapped_column(Integer, default=0)
    commissions_total: Mapped[int] = mapped_column(Integer, default=0)
    ultimate_challenge_score: Mapped[int] = mapped_column(Integer, default=0)
    ultimate_challenge_tier: Mapped[str] = mapped_column(String(32), default="")
    data_collected: Mapped[int] = mapped_column(Integer, default=0)

    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    account: Mapped[Account] = relationship()


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (UniqueConstraint("account_uid", "game_id", name="uq_agents_account_game"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), index=True
    )
    game_id: Mapped[int] = mapped_column(Integer)

    level: Mapped[int] = mapped_column(Integer, default=1)
    promotion_level: Mapped[int] = mapped_column(Integer, default=0)
    mindscape_level: Mapped[int] = mapped_column(Integer, default=0)
    core_skill_enhancement: Mapped[int] = mapped_column(Integer, default=0)
    skill_levels: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    weapon_effect_state: Mapped[int | None] = mapped_column(Integer, default=None)
    obtained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    source: Mapped[str] = mapped_column(String(16), default=SOURCE_ENKA)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    account: Mapped[Account] = relationship(back_populates="agents")
    wengine: Mapped[WEngine | None] = relationship(
        back_populates="agent",
        cascade="all, delete-orphan",
        uselist=False,
    )
    discs: Mapped[list[DriveDisc]] = relationship(
        back_populates="agent",
        cascade="all, delete-orphan",
        order_by="DriveDisc.slot",
    )

    @property
    def is_manual(self) -> bool:
        return self.source == SOURCE_MANUAL


class WEngine(Base):
    """Equipped W-Engine. `modification_level` is Enka's BreakLevel, `phase` its UpgradeLevel."""

    __tablename__ = "wengines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), unique=True, index=True
    )
    game_id: Mapped[int] = mapped_column(Integer)
    level: Mapped[int] = mapped_column(Integer, default=1)
    modification_level: Mapped[int] = mapped_column(Integer, default=0)
    phase: Mapped[int] = mapped_column(Integer, default=1)
    item_uid: Mapped[int | None] = mapped_column(Integer, default=None)

    agent: Mapped[Agent] = relationship(back_populates="wengine")


class DriveDisc(Base):
    """Equipped drive disc.

    `game_id` is the individual piece id and `set_id` the set it completes, resolved from the
    static data. `roll_count` is Enka's BreakLevel: how many substat rolls the piece received.
    `substats` is a list of `{"prop_id": int, "value": int, "rolls": int}`.
    """

    __tablename__ = "drive_discs"
    __table_args__ = (UniqueConstraint("agent_id", "slot", name="uq_drive_discs_agent_slot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    slot: Mapped[int] = mapped_column(Integer)
    game_id: Mapped[int] = mapped_column(Integer)
    set_id: Mapped[int | None] = mapped_column(Integer, default=None)
    rarity: Mapped[int | None] = mapped_column(Integer, default=None)
    level: Mapped[int] = mapped_column(Integer, default=0)
    roll_count: Mapped[int] = mapped_column(Integer, default=0)
    main_stat_id: Mapped[int | None] = mapped_column(Integer, default=None)
    main_stat_value: Mapped[int] = mapped_column(Integer, default=0)
    substats: Mapped[list[Any]] = mapped_column(JSON, default=list)
    item_uid: Mapped[int | None] = mapped_column(Integer, default=None)

    agent: Mapped[Agent] = relationship(back_populates="discs")


class AgentBuildSnapshot(Base):
    """The raw `avatar/info` entry an import brought for one agent.

    One row per account and agent, overwritten by every import: the snapshot is the escape
    valve for whatever the mapper does not read yet, so what matters is that it mirrors the
    build currently stored, not how it looked last month. Keeping a history here would grow
    without bound for a value nobody reads twice; a build history, if it ever exists, belongs
    to the tracked build and not to a copy of the payload.
    """

    __tablename__ = "agent_build_snapshots"
    __table_args__ = (
        UniqueConstraint("account_uid", "game_id", name="uq_agent_build_snapshots_account_game"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), index=True
    )
    game_id: Mapped[int] = mapped_column(Integer)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(64))
    notes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    account: Mapped[Account] = relationship(back_populates="teams")
    members: Mapped[list[TeamMember]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="TeamMember.slot",
    )


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "slot", name="uq_team_members_team_slot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    slot: Mapped[int] = mapped_column(Integer)

    team: Mapped[Team] = relationship(back_populates="members")
    agent: Mapped[Agent] = relationship()
