from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.models import Account, Agent, DriveDisc, Team, WEngine, as_utc
from zzz_tracker.tracker.service import TEAM_SLOTS, TeamEdit, TeamMemberEdit

UID_PATTERN = r"^\d{6,16}$"


class ErrorResponse(BaseModel):
    """Body of every error the tracker answers with."""

    detail: str


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str


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
            agent_count=len(account.agents),
        )


class AccountListResponse(BaseModel):
    items: list[AccountRead]


class StatRead(BaseModel):
    """A stat as Enka reports it, with the name and display format resolved when possible."""

    prop_id: int
    name: str | None
    format: str | None
    value: int
    rolls: int = 0

    @classmethod
    def from_parts(
        cls, prop_id: int, value: int, rolls: int, static: StaticData | None
    ) -> StatRead:
        info = static.property(prop_id) if static else None
        return cls(
            prop_id=prop_id,
            name=info.name if info else None,
            format=info.format if info else None,
            value=value,
            rolls=rolls,
        )

    @classmethod
    def from_substat(cls, raw: Any, static: StaticData | None) -> StatRead | None:
        if not isinstance(raw, dict) or not isinstance(raw.get("prop_id"), int):
            return None
        return cls.from_parts(
            prop_id=raw["prop_id"],
            value=int(raw.get("value", 0)),
            rolls=int(raw.get("rolls", 0)),
            static=static,
        )


class WEngineRead(BaseModel):
    game_id: int
    name: str | None
    icon_url: str | None
    rarity: int | None
    level: int
    modification_level: int
    phase: int

    @classmethod
    def from_wengine(cls, wengine: WEngine, static: StaticData | None) -> WEngineRead:
        info = static.wengine(wengine.game_id) if static else None
        return cls(
            game_id=wengine.game_id,
            name=info.name if info else None,
            icon_url=info.image_url if info else None,
            rarity=info.rarity if info else None,
            level=wengine.level,
            modification_level=wengine.modification_level,
            phase=wengine.phase,
        )


class DriveDiscRead(BaseModel):
    slot: int
    game_id: int
    set_id: int | None
    set_name: str | None
    set_icon_url: str | None
    rarity: int | None
    level: int
    roll_count: int
    main_stat: StatRead | None
    substats: list[StatRead]

    @classmethod
    def from_disc(cls, disc: DriveDisc, static: StaticData | None) -> DriveDiscRead:
        disc_set = static.disc_set(disc.set_id) if static and disc.set_id else None
        substats = [StatRead.from_substat(raw, static) for raw in disc.substats]
        main_stat = (
            StatRead.from_parts(disc.main_stat_id, disc.main_stat_value, 0, static)
            if disc.main_stat_id is not None
            else None
        )
        return cls(
            slot=disc.slot,
            game_id=disc.game_id,
            set_id=disc.set_id,
            set_name=disc_set.name if disc_set else None,
            set_icon_url=disc_set.icon_url if disc_set else None,
            rarity=disc.rarity,
            level=disc.level,
            roll_count=disc.roll_count,
            main_stat=main_stat,
            substats=[stat for stat in substats if stat is not None],
        )


class EquippedSetRead(BaseModel):
    """How many pieces of a disc set the agent wears, and the 2-piece bonus it grants."""

    set_id: int
    name: str | None
    icon_url: str | None
    pieces: int
    bonus_props: dict[str, int]


class AgentRead(BaseModel):
    id: int
    account_uid: str
    game_id: int
    name: str | None
    icon_url: str | None
    rarity: int | None
    profession: str | None
    elements: list[str]
    level: int
    promotion_level: int
    mindscape_level: int
    core_skill_enhancement: int
    source: str
    wengine: WEngineRead | None
    disc_count: int

    @classmethod
    def from_agent(cls, agent: Agent, static: StaticData | None) -> AgentRead:
        info = static.agent(agent.game_id) if static else None
        return cls(
            id=agent.id,
            account_uid=agent.account_uid,
            game_id=agent.game_id,
            name=info.name if info else None,
            icon_url=info.circle_icon_url if info else None,
            rarity=info.rarity if info else None,
            profession=info.profession if info else None,
            elements=list(info.elements) if info else [],
            level=agent.level,
            promotion_level=agent.promotion_level,
            mindscape_level=agent.mindscape_level,
            core_skill_enhancement=agent.core_skill_enhancement,
            source=agent.source,
            wengine=WEngineRead.from_wengine(agent.wengine, static) if agent.wengine else None,
            disc_count=len(agent.discs),
        )


class AgentDetailRead(AgentRead):
    image_url: str | None
    skill_levels: dict[str, int]
    weapon_effect_state: int | None
    obtained_at: datetime | None
    discs: list[DriveDiscRead]
    equipped_sets: list[EquippedSetRead]

    @classmethod
    def from_agent(cls, agent: Agent, static: StaticData | None) -> AgentDetailRead:
        summary = AgentRead.from_agent(agent, static)
        info = static.agent(agent.game_id) if static else None
        return cls(
            **summary.model_dump(),
            image_url=info.image_url if info else None,
            skill_levels={str(key): int(value) for key, value in agent.skill_levels.items()},
            weapon_effect_state=agent.weapon_effect_state,
            obtained_at=as_utc(agent.obtained_at),
            discs=[DriveDiscRead.from_disc(disc, static) for disc in agent.discs],
            equipped_sets=cls._equipped_sets(agent, static),
        )

    @staticmethod
    def _equipped_sets(agent: Agent, static: StaticData | None) -> list[EquippedSetRead]:
        counts = Counter(disc.set_id for disc in agent.discs if disc.set_id is not None)
        sets: list[EquippedSetRead] = []
        for set_id, pieces in counts.most_common():
            info = static.disc_set(set_id) if static else None
            sets.append(
                EquippedSetRead(
                    set_id=set_id,
                    name=info.name if info else None,
                    icon_url=info.icon_url if info else None,
                    pieces=pieces,
                    bonus_props=dict(info.set_bonus) if info else {},
                )
            )
        return sets


class AgentListResponse(BaseModel):
    items: list[AgentRead]


class TeamMemberWrite(BaseModel):
    slot: int = Field(ge=1, le=TEAM_SLOTS, description="Position of the agent in the team")
    agent_id: int = Field(ge=1, description="Id of an agent tracked for the same account")


class TeamWrite(BaseModel):
    """The whole team: sending it replaces the name, the notes and every member."""

    name: str = Field(min_length=1, max_length=64)
    notes: str = ""
    members: list[TeamMemberWrite] = Field(min_length=1, max_length=TEAM_SLOTS)

    def as_edit(self) -> TeamEdit:
        return TeamEdit(
            name=self.name,
            notes=self.notes,
            members=tuple(
                TeamMemberEdit(slot=member.slot, agent_id=member.agent_id)
                for member in self.members
            ),
        )


class TeamMemberRead(BaseModel):
    """A filled slot, with the agent resolved so the team renders without extra requests."""

    slot: int
    agent: AgentRead


class TeamRead(BaseModel):
    id: int
    account_uid: str
    name: str
    notes: str
    members: list[TeamMemberRead]
    created_at: datetime | None
    updated_at: datetime | None

    @classmethod
    def from_team(cls, team: Team, static: StaticData | None) -> TeamRead:
        return cls(
            id=team.id,
            account_uid=team.account_uid,
            name=team.name,
            notes=team.notes,
            members=[
                TeamMemberRead(slot=member.slot, agent=AgentRead.from_agent(member.agent, static))
                for member in team.members
            ],
            created_at=as_utc(team.created_at),
            updated_at=as_utc(team.updated_at),
        )


class TeamListResponse(BaseModel):
    items: list[TeamRead]


class CatalogAgentRead(BaseModel):
    """One entry of the agent catalog, already resolved to the server's language."""

    game_id: int
    name: str
    rarity: int | None
    profession: str | None
    elements: list[str]
    image_url: str | None
    icon_url: str | None


class CatalogWEngineRead(BaseModel):
    game_id: int
    name: str
    rarity: int | None
    profession: str | None
    image_url: str | None


class CatalogDiscSetRead(BaseModel):
    set_id: int
    name: str
    icon_url: str | None
    bonus_props: dict[str, int]


class CatalogPropertyRead(BaseModel):
    prop_id: int
    name: str
    format: str


class CatalogAgentListResponse(BaseModel):
    """Never empty: without downloaded static data the catalog answers 503, not `[]`."""

    items: list[CatalogAgentRead]


class CatalogWEngineListResponse(BaseModel):
    """Never empty: without downloaded static data the catalog answers 503, not `[]`."""

    items: list[CatalogWEngineRead]


class CatalogDiscSetListResponse(BaseModel):
    """Never empty: without downloaded static data the catalog answers 503, not `[]`."""

    items: list[CatalogDiscSetRead]


class CatalogPropertyListResponse(BaseModel):
    """Never empty: without downloaded static data the catalog answers 503, not `[]`."""

    items: list[CatalogPropertyRead]
