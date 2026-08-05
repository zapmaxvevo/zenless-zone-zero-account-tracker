from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import (
    JSON,
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

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    sync_ttl_seconds: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

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
    obtained_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    source: Mapped[str] = mapped_column(String(16), default=SOURCE_ENKA)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

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

    `game_id` is the individual piece id, `suit_id` the set it belongs to (resolved from the
    static data), and `roll_count` is Enka's BreakLevel: how many substat rolls it received.
    `main_stat` is `{"property_id": int, "value": int}` and `substats` a list of
    `{"property_id": int, "value": int, "rolls": int}`.
    """

    __tablename__ = "drive_discs"
    __table_args__ = (UniqueConstraint("agent_id", "slot", name="uq_drive_discs_agent_slot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    slot: Mapped[int] = mapped_column(Integer)
    game_id: Mapped[int] = mapped_column(Integer)
    suit_id: Mapped[int | None] = mapped_column(Integer, default=None)
    rarity: Mapped[int | None] = mapped_column(Integer, default=None)
    level: Mapped[int] = mapped_column(Integer, default=0)
    roll_count: Mapped[int] = mapped_column(Integer, default=0)
    main_stat: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    substats: Mapped[list[Any]] = mapped_column(JSON, default=list)
    item_uid: Mapped[int | None] = mapped_column(Integer, default=None)

    agent: Mapped[Agent] = relationship(back_populates="discs")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_uid: Mapped[str] = mapped_column(
        ForeignKey("accounts.uid", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(64))
    notes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

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
