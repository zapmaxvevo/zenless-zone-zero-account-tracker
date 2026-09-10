from __future__ import annotations

from collections import Counter
from datetime import datetime

from pydantic import BaseModel, Field

from zzz_tracker.discs.values import MAX_SUBSTAT_ROLLS
from zzz_tracker.enka.mapper import ParsedAgent, ParsedDisc, ParsedStat, ParsedWEngine
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.models import Agent, DriveDisc, WEngine, as_utc
from zzz_tracker.tracker.service import DISC_SLOTS, AgentEdit
from zzz_tracker.web.schemas.common import (
    MAX_CORE_SKILL_ENHANCEMENT,
    MAX_DISC_LEVEL,
    MAX_DISC_PROCS,
    MAX_LEVEL,
    MAX_MINDSCAPE_LEVEL,
    MAX_MODIFICATION_LEVEL,
    MAX_PHASE,
    MAX_PROMOTION_LEVEL,
    MAX_RARITY,
    MIN_SUBSTAT_ROLLS,
    StatRead,
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
            StatRead.from_main_stat(
                disc.main_stat_id, disc.main_stat_value, disc.rarity, disc.level, static
            )
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


class SubstatWrite(BaseModel):
    """One substat of a hand-typed disc; only the manual write path builds these."""

    prop_id: int = Field(ge=1, description="Enka property id, as served by /catalog/properties")
    value: int = Field(default=0, ge=0, description="Raw base value, per roll, not the total")
    rolls: int = Field(
        default=MIN_SUBSTAT_ROLLS,
        ge=MIN_SUBSTAT_ROLLS,
        le=MAX_SUBSTAT_ROLLS,
        description="Total rolls, initial one included: a substat on the disc has at least one",
    )


class WEngineWrite(BaseModel):
    game_id: int = Field(ge=1)
    level: int = Field(default=1, ge=1, le=MAX_LEVEL)
    modification_level: int = Field(default=0, ge=0, le=MAX_MODIFICATION_LEVEL)
    phase: int = Field(default=1, ge=1, le=MAX_PHASE)

    def as_parsed(self) -> ParsedWEngine:
        return ParsedWEngine(
            game_id=self.game_id,
            level=self.level,
            modification_level=self.modification_level,
            phase=self.phase,
            item_uid=None,
        )


class DriveDiscWrite(BaseModel):
    """One equipped disc. `set_id` and `rarity` are looked up from the static data when omitted."""

    slot: int = Field(ge=1, le=DISC_SLOTS)
    game_id: int = Field(ge=1, description="Id of the piece itself, not of its set")
    set_id: int | None = None
    rarity: int | None = Field(default=None, ge=1, le=MAX_RARITY)
    level: int = Field(default=0, ge=0, le=MAX_DISC_LEVEL)
    roll_count: int = Field(default=0, ge=0, le=MAX_DISC_PROCS)
    main_stat_id: int | None = None
    main_stat_value: int = Field(default=0, ge=0)
    substats: list[SubstatWrite] = Field(default_factory=list)

    def as_parsed(self, static: StaticData | None) -> ParsedDisc:
        main_stat = (
            ParsedStat(prop_id=self.main_stat_id, value=self.main_stat_value)
            if self.main_stat_id is not None
            else None
        )
        return ParsedDisc(
            slot=self.slot,
            game_id=self.game_id,
            set_id=self.set_id if self.set_id is not None else self._known_set_id(static),
            rarity=self.rarity if self.rarity is not None else self._known_rarity(static),
            level=self.level,
            roll_count=self.roll_count,
            main_stat=main_stat,
            substats=tuple(
                ParsedStat(prop_id=stat.prop_id, value=stat.value, rolls=stat.rolls)
                for stat in self.substats
            ),
            item_uid=None,
        )

    def _known_set_id(self, static: StaticData | None) -> int | None:
        return static.disc_set_id(self.game_id) if static else None

    def _known_rarity(self, static: StaticData | None) -> int | None:
        return static.disc_rarity(self.game_id) if static else None


class AgentWrite(BaseModel):
    """An agent typed in by hand, with the build it wears; unsent fields start at zero."""

    game_id: int = Field(ge=1, description="Id from /catalog/agents")
    level: int = Field(default=1, ge=1, le=MAX_LEVEL)
    promotion_level: int = Field(default=0, ge=0, le=MAX_PROMOTION_LEVEL)
    mindscape_level: int = Field(default=0, ge=0, le=MAX_MINDSCAPE_LEVEL)
    core_skill_enhancement: int = Field(default=0, ge=0, le=MAX_CORE_SKILL_ENHANCEMENT)
    skill_levels: dict[str, int] = Field(
        default_factory=dict, description="Skill index as string to its level"
    )
    wengine: WEngineWrite | None = None
    discs: list[DriveDiscWrite] = Field(default_factory=list)

    def as_parsed_agent(self, static: StaticData | None) -> ParsedAgent:
        return ParsedAgent(
            game_id=self.game_id,
            level=self.level,
            promotion_level=self.promotion_level,
            mindscape_level=self.mindscape_level,
            core_skill_enhancement=self.core_skill_enhancement,
            skill_levels=dict(self.skill_levels),
            weapon_effect_state=None,
            obtained_at=None,
            wengine=self.wengine.as_parsed() if self.wengine else None,
            discs=tuple(disc.as_parsed(static) for disc in self.discs),
        )


class AgentUpdate(BaseModel):
    """A correction to a tracked agent: every field is optional and only what is sent changes.

    `wengine` and `discs` are replaced rather than merged, and `"wengine": null` unequips it.
    """

    level: int | None = Field(default=None, ge=1, le=MAX_LEVEL)
    promotion_level: int | None = Field(default=None, ge=0, le=MAX_PROMOTION_LEVEL)
    mindscape_level: int | None = Field(default=None, ge=0, le=MAX_MINDSCAPE_LEVEL)
    core_skill_enhancement: int | None = Field(default=None, ge=0, le=MAX_CORE_SKILL_ENHANCEMENT)
    skill_levels: dict[str, int] | None = None
    wengine: WEngineWrite | None = None
    discs: list[DriveDiscWrite] | None = None

    def as_edit(self, static: StaticData | None) -> AgentEdit:
        return AgentEdit(
            level=self.level,
            promotion_level=self.promotion_level,
            mindscape_level=self.mindscape_level,
            core_skill_enhancement=self.core_skill_enhancement,
            skill_levels=dict(self.skill_levels) if self.skill_levels is not None else None,
            wengine=self.wengine.as_parsed() if self.wengine else None,
            clear_wengine="wengine" in self.model_fields_set and self.wengine is None,
            discs=(
                tuple(disc.as_parsed(static) for disc in self.discs)
                if self.discs is not None
                else None
            ),
        )
