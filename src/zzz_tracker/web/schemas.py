from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from zzz_tracker.discs.values import MAX_SUBSTAT_ROLLS, main_stat_total, substat_total
from zzz_tracker.enka.mapper import ParsedAgent, ParsedDisc, ParsedStat, ParsedWEngine
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.models import (
    KNOWN_REGIONS,
    Account,
    Agent,
    ChallengeRun,
    ChallengeRunEntry,
    DriveDisc,
    LostVoidProgress,
    Team,
    WEngine,
    as_utc,
    region_for_uid,
)
from zzz_tracker.tracker.service import (
    DISC_SLOTS,
    TEAM_SLOTS,
    AgentEdit,
    ChronicleImportReport,
    TeamEdit,
    TeamMemberEdit,
)

UID_PATTERN = r"^\d{6,16}$"

# In-game caps, used to keep hand-typed builds honest. Raise them when the game does.
MAX_LEVEL = 60
MAX_PROMOTION_LEVEL = 5
MAX_MINDSCAPE_LEVEL = 6
MAX_CORE_SKILL_ENHANCEMENT = 6
MAX_MODIFICATION_LEVEL = 5
MAX_PHASE = 5
MAX_RARITY = 5
MAX_DISC_LEVEL = 15
# Procs the disc itself receives -- Enka's BreakLevel -- against the roll count of one substat.
# They are not the same number: an S disc gets 5 procs, but a substat that soaks up every one of
# them on top of its initial roll reads 6. `MAX_SUBSTAT_ROLLS` lives in `discs.values`, next to
# the tables that explain it.
MAX_DISC_PROCS = 5
# A substat that exists on the disc was rolled at least once: zero rolls is not a substat.
MIN_SUBSTAT_ROLLS = 1


def _known_region(region: str) -> str:
    """Refuse a region HoYoLAB does not serve.

    The region decides which host the server-side sync will call for this account later, so
    a typo would not fail here but much later, as an unrelated network error. Empty is the
    honest answer for "I do not know", and the UID answers it instead.
    """
    if region and region not in KNOWN_REGIONS:
        known = ", ".join(sorted(KNOWN_REGIONS))
        raise ValueError(f"{region!r} is not a HoYoLAB region; expected one of: {known}")
    return region


RegionField = Annotated[
    str,
    Field(
        description=(
            "HoYoLAB region of the account; empty to derive it from the UID. "
            f"One of: {', '.join(sorted(KNOWN_REGIONS))}."
        ),
    ),
    AfterValidator(_known_region),
]


class ErrorResponse(BaseModel):
    """Body of every error the tracker answers with.

    `code` is the stable half: clients branch on it, and it does not change when the wording
    of `detail` does. The codes live next to the exceptions in `errors.py`.
    """

    detail: str
    code: str


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


class StatRead(BaseModel):
    """A stat as Enka reports it, with the name, display format and in-game value resolved.

    Enka sends bases, not what the player reads: `value` is that base and `total` is the number
    the game shows, once the roll count or the disc level has been applied. `total` is None only
    when a main stat cannot be scaled because the disc's rarity or level are unknown.
    """

    prop_id: int
    name: str | None
    format: str | None
    value: int
    rolls: int = 0
    total: int | None = None

    @classmethod
    def from_parts(
        cls, prop_id: int, value: int, rolls: int, total: int | None, static: StaticData | None
    ) -> StatRead:
        info = static.property(prop_id) if static else None
        return cls(
            prop_id=prop_id,
            name=info.name if info else None,
            format=info.format if info else None,
            value=value,
            rolls=rolls,
            total=total,
        )

    @classmethod
    def from_main_stat(
        cls, prop_id: int, value: int, rarity: int | None, level: int, static: StaticData | None
    ) -> StatRead:
        return cls.from_parts(
            prop_id=prop_id,
            value=value,
            rolls=0,
            total=main_stat_total(value, rarity, level),
            static=static,
        )

    @classmethod
    def from_substat(cls, raw: Any, static: StaticData | None) -> StatRead | None:
        if not isinstance(raw, dict) or not isinstance(raw.get("prop_id"), int):
            return None
        value = int(raw.get("value", 0))
        rolls = int(raw.get("rolls", 0))
        return cls.from_parts(
            prop_id=raw["prop_id"],
            value=value,
            rolls=rolls,
            total=substat_total(value, rolls),
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
    """One substat of a hand-typed disc.

    Only the manual write path builds these: the Enka parser and the HoYoLAB import go
    straight to `ParsedStat`, so the roll floor below never rejects imported data.
    """

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

    `wengine` and `discs` are replaced rather than merged — sending discs means sending the
    whole set, and `"wengine": null` unequips it. Applying any of this turns the agent into a
    manual one, so later syncs stop overwriting it.
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

    Every key of `payloads` is optional except `index`, which confirms the UID; a section
    the browser could not fetch comes absent or `null` and is skipped, not refused. Unknown
    keys anywhere are ignored so the extension can evolve ahead of the backend.
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

    `account_key` is filled in exactly once per account: on the import that gave it an
    owner. Every later import presents that key and gets `null` back, so a client only ever
    stores a key it is being handed.
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
