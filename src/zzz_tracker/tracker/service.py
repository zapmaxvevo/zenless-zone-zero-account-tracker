from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.mapper import (
    ParsedAgent,
    ParsedDisc,
    ParsedProfile,
    ParsedWEngine,
    parse_profile,
)
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from zzz_tracker.hoyolab.build_mapper import parse_agent_builds, raw_agents
from zzz_tracker.hoyolab.mapper import (
    ParsedBangboo,
    ParsedChallengeRun,
    ParsedLostVoid,
    ParsedRosterAgent,
    parse_bangboos,
    parse_challenge_nickname,
    parse_chronicle_account,
    parse_chronicle_uid,
    parse_deadly_assault,
    parse_lost_void,
    parse_record_card,
    parse_roster_agents,
    parse_shiyu_defense,
)
from zzz_tracker.storage import keys
from zzz_tracker.storage.models import (
    CHINA_REGION,
    CHRONICLE_SOURCE_EXTENSION,
    KNOWN_REGIONS,
    SOURCE_ENKA,
    SOURCE_HOYOLAB,
    SOURCE_MANUAL,
    Account,
    AccountKey,
    Agent,
    AgentBuildSnapshot,
    Bangboo,
    ChallengeRun,
    ChallengeRunEntry,
    DriveDisc,
    LostVoidProgress,
    Team,
    TeamMember,
    WEngine,
    region_for_uid,
    utc_now,
)

DEFAULT_SYNC_TTL_SECONDS = 60
TEAM_SLOTS = 3
DISC_SLOTS = 6

SECTION_INDEX = "index"
SECTION_RECORD_CARD = "record_card"
SECTION_AVATAR_BASIC = "avatar_basic"
SECTION_AVATAR_INFO = "avatar_info"
SECTION_BUDDY_INFO = "buddy_info"
SECTION_SHIYU_DEFENSE = "shiyu_defense"
SECTION_DEADLY_ASSAULT = "deadly_assault"
SECTION_LOST_VOID = "lost_void"


@dataclass(frozen=True, slots=True)
class AgentEdit:
    """A partial change to a tracked agent.

    `None` means "leave it as it is". `wengine` and `discs` are not merged: a W-Engine
    replaces whatever was equipped, and the discs replace the whole set, so a build is
    edited by sending it complete. `clear_wengine` unequips the current one.
    """

    level: int | None = None
    promotion_level: int | None = None
    mindscape_level: int | None = None
    core_skill_enhancement: int | None = None
    skill_levels: dict[str, int] | None = None
    wengine: ParsedWEngine | None = None
    clear_wengine: bool = False
    discs: tuple[ParsedDisc, ...] | None = None


@dataclass(frozen=True, slots=True)
class TeamMemberEdit:
    slot: int
    agent_id: int


@dataclass(frozen=True, slots=True)
class TeamEdit:
    """The whole content of a team: writing a team replaces name, notes and members."""

    name: str
    notes: str = ""
    members: tuple[TeamMemberEdit, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ChroniclePayloads:
    """The raw `data` of every Battle Chronicle endpoint, as the browser received it.

    `source` records how the bundle got here, and today there is one answer: the extension.
    `index` is the only mandatory section; a `None` (or an empty season map) means that
    section was not available and gets skipped, not refused. `avatar_info` holds one
    response per agent, each with the whole build of that agent.

    `record_card` is not a chronicle endpoint but the ZZZ entry of the HoYoLAB profile, and
    the only payload that names the account: the `index` carries neither UID, nickname nor
    level. A capture that could not fetch it is normal, so its absence is never reported as
    a skipped section.
    """

    region: str
    source: str
    index: dict[str, Any]
    record_card: dict[str, Any] | None = None
    avatar_basic: dict[str, Any] | None = None
    buddy_info: dict[str, Any] | None = None
    shiyu_defense: dict[int, dict[str, Any]] = field(default_factory=dict)
    deadly_assault: dict[int, dict[str, Any]] = field(default_factory=dict)
    lost_void: dict[str, Any] | None = None
    avatar_info: tuple[dict[str, Any], ...] = field(default_factory=tuple)


def _import_section(payloads: dict[str, Any], key: str) -> dict[str, Any] | None:
    section = payloads.get(key)
    return section if isinstance(section, dict) else None


def _import_seasons(payloads: dict[str, Any], key: str) -> dict[int, dict[str, Any]]:
    section = payloads.get(key)
    if not isinstance(section, dict):
        return {}
    seasons: dict[int, dict[str, Any]] = {}
    for raw_schedule, season in section.items():
        if not isinstance(season, dict):
            continue
        try:
            schedule_type = int(raw_schedule)
        except (TypeError, ValueError):
            continue
        seasons[schedule_type] = season
    return seasons


def _import_builds(payloads: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    section = payloads.get(SECTION_AVATAR_INFO)
    items = section if isinstance(section, list) else [section]
    return tuple(item for item in items if isinstance(item, dict))


@dataclass(frozen=True, slots=True)
class ChronicleImportReport:
    """What one imported bundle turned into."""

    account: Account
    runs: tuple[ChallengeRun, ...] = field(default_factory=tuple)
    agents_synced: int = 0
    bangboos_synced: int = 0
    builds_synced: int = 0
    lost_void_synced: bool = False
    unavailable_modes: tuple[str, ...] = field(default_factory=tuple)
    skipped_sections: tuple[str, ...] = field(default_factory=tuple)
    # The key the import handed out when it claimed the account, readable this once only.
    account_key: str | None = None


class TrackerService:
    """Use cases around tracked accounts: importing from Enka, editing by hand, reading back.

    Sync never overwrites hand-edited data: agents whose `source` is `manual` are left
    untouched, and agents missing from the showcase are kept rather than deleted, since
    Enka only exposes the handful of agents the player put on display. Editing an agent is
    what marks it `manual`, so a correction survives every later sync.
    """

    def __init__(
        self,
        session: Session,
        enka: EnkaClient,
        static: StaticData | None = None,
    ) -> None:
        self._session = session
        self._enka = enka
        self._static = static

    def list_accounts(self) -> list[Account]:
        return list(self._session.scalars(select(Account).order_by(Account.uid)))

    def find_account(self, uid: str) -> Account | None:
        return self._session.get(Account, uid)

    def get_account(self, uid: str) -> Account:
        account = self.find_account(uid)
        if account is None:
            raise NotFoundError(f"Account {uid} is not tracked yet")
        return account

    def claim_account(self, uid: str) -> str:
        """Take ownership of a tracked account nobody claimed, and get its key once.

        Not reachable over HTTP: the web can track a UID but never own one, because typing
        a public number proves nothing. This is the CLI door, for an account that predates
        account keys or whose owner will never run the extension.
        """
        account = self.get_account(uid)
        if account.is_claimed:
            raise ConflictError(
                f"Account {uid} already has an owner; write to it with its `X-Account-Key`, "
                f"or run `zzz-tracker rotate-key {uid}` where the database lives to issue a "
                "new key and invalidate the old one"
            )
        return self._issue_key(account)

    def rotate_key(self, uid: str) -> str:
        """Give the account a brand new key, killing the one it had."""
        account = self.get_account(uid)
        return self._issue_key(account, rotating=account.is_claimed)

    def verify_key(self, uid: str, given: str) -> bool:
        """Whether `given` is the key of that account, stamping it as used when it is."""
        account = self.get_account(uid)
        key = account.key
        if key is None or not keys.verify_key(key.key_hash, given):
            return False
        key.last_used_at = utc_now()
        self._session.commit()
        return True

    def account_uid_for_agent(self, agent_id: int) -> str:
        """Which account owns an agent, since agent ids are global and name no UID."""
        return self.get_agent(agent_id).account_uid

    def account_uid_for_team(self, team_id: int) -> str:
        return self.get_team(team_id).account_uid

    def _issue_key(self, account: Account, rotating: bool = False) -> str:
        key = account.key or AccountKey(account_uid=account.uid)
        secret = keys.generate_key()
        key.key_hash = keys.hash_key(secret)
        if rotating:
            key.rotated_at = utc_now()
        else:
            key.claimed_at = utc_now()
        account.key = key
        self._session.commit()
        return secret

    def list_agents(self, uid: str) -> list[Agent]:
        self.get_account(uid)
        return list(
            self._session.scalars(
                select(Agent).where(Agent.account_uid == uid).order_by(Agent.game_id)
            )
        )

    def get_agent(self, agent_id: int) -> Agent:
        agent = self._session.get(Agent, agent_id)
        if agent is None:
            raise NotFoundError(f"Agent {agent_id} is not tracked")
        return agent

    def create_agent(self, uid: str, parsed: ParsedAgent) -> Agent:
        """Add an agent Enka never showed, with the build the player typed in."""
        account = self.get_account(uid)
        if self._find_agent(uid, parsed.game_id) is not None:
            raise ConflictError(f"Agent {parsed.game_id} is already tracked for account {uid}")
        self._ensure_one_disc_per_slot(parsed.discs)

        agent = Agent(account_uid=account.uid, game_id=parsed.game_id)
        self._session.add(agent)
        agent.level = parsed.level
        agent.promotion_level = parsed.promotion_level
        agent.mindscape_level = parsed.mindscape_level
        agent.core_skill_enhancement = parsed.core_skill_enhancement
        agent.skill_levels = dict(parsed.skill_levels)
        agent.weapon_effect_state = parsed.weapon_effect_state
        agent.obtained_at = parsed.obtained_at
        agent.source = SOURCE_MANUAL
        self._session.flush()

        self._replace_wengine(agent, parsed.wengine)
        self._replace_discs(agent, parsed.discs)

        self._session.commit()
        self._session.refresh(agent)
        return agent

    def update_agent(self, agent_id: int, edit: AgentEdit) -> Agent:
        """Correct an agent by hand. Doing so makes it `manual`, so no sync overwrites it."""
        agent = self.get_agent(agent_id)
        if edit.discs is not None:
            self._ensure_one_disc_per_slot(edit.discs)

        if edit.level is not None:
            agent.level = edit.level
        if edit.promotion_level is not None:
            agent.promotion_level = edit.promotion_level
        if edit.mindscape_level is not None:
            agent.mindscape_level = edit.mindscape_level
        if edit.core_skill_enhancement is not None:
            agent.core_skill_enhancement = edit.core_skill_enhancement
        if edit.skill_levels is not None:
            agent.skill_levels = dict(edit.skill_levels)
        agent.source = SOURCE_MANUAL
        self._session.flush()

        if edit.wengine is not None or edit.clear_wengine:
            self._replace_wengine(agent, edit.wengine)
        if edit.discs is not None:
            self._replace_discs(agent, edit.discs)

        self._session.commit()
        self._session.refresh(agent)
        return agent

    def delete_agent(self, agent_id: int) -> None:
        """Stop tracking an agent, freeing the slot it held in any team comp."""
        agent = self.get_agent(agent_id)
        self._session.execute(delete(TeamMember).where(TeamMember.agent_id == agent.id))
        self._session.delete(agent)
        self._session.commit()

    def _find_agent(self, uid: str, game_id: int) -> Agent | None:
        return self._session.scalars(
            select(Agent).where(Agent.account_uid == uid, Agent.game_id == game_id)
        ).one_or_none()

    def _ensure_one_disc_per_slot(self, discs: Sequence[ParsedDisc]) -> None:
        slots = [disc.slot for disc in discs]
        if len(set(slots)) != len(slots):
            raise ValidationError("Each drive disc slot can only be filled once")

    def list_teams(self, uid: str) -> list[Team]:
        self.get_account(uid)
        return list(
            self._session.scalars(select(Team).where(Team.account_uid == uid).order_by(Team.id))
        )

    def get_team(self, team_id: int) -> Team:
        team = self._session.get(Team, team_id)
        if team is None:
            raise NotFoundError(f"Team {team_id} does not exist")
        return team

    def create_team(self, uid: str, edit: TeamEdit) -> Team:
        account = self.get_account(uid)
        self._validate_members(account.uid, edit.members)

        team = Team(account_uid=account.uid, name=edit.name, notes=edit.notes)
        self._session.add(team)
        self._session.flush()
        self._fill_slots(team, edit.members)

        self._session.commit()
        self._session.refresh(team)
        return team

    def update_team(self, team_id: int, edit: TeamEdit) -> Team:
        """Rewrite a team: its members are replaced by the ones given, slot by slot."""
        team = self.get_team(team_id)
        self._validate_members(team.account_uid, edit.members)

        team.name = edit.name
        team.notes = edit.notes
        team.members.clear()
        self._session.flush()
        self._fill_slots(team, edit.members)

        self._session.commit()
        self._session.refresh(team)
        return team

    def delete_team(self, team_id: int) -> None:
        team = self.get_team(team_id)
        self._session.delete(team)
        self._session.commit()

    def _fill_slots(self, team: Team, members: Sequence[TeamMemberEdit]) -> None:
        for member in members:
            team.members.append(TeamMember(agent_id=member.agent_id, slot=member.slot))
        self._session.flush()

    def _validate_members(self, uid: str, members: Sequence[TeamMemberEdit]) -> None:
        """A team holds one to three agents of its own account, one per slot."""
        if not 1 <= len(members) <= TEAM_SLOTS:
            raise ValidationError(f"A team holds between 1 and {TEAM_SLOTS} agents")

        slots = [member.slot for member in members]
        if any(not 1 <= slot <= TEAM_SLOTS for slot in slots):
            raise ValidationError(f"Team slots go from 1 to {TEAM_SLOTS}")
        if len(set(slots)) != len(slots):
            raise ValidationError("Each team slot can only be filled once")

        agent_ids = [member.agent_id for member in members]
        if len(set(agent_ids)) != len(agent_ids):
            raise ValidationError("An agent cannot take more than one slot in the same team")

        for agent_id in agent_ids:
            agent = self.get_agent(agent_id)
            if agent.account_uid != uid:
                raise ValidationError(f"Agent {agent_id} does not belong to account {uid}")

    def sync_account(self, uid: str, force: bool = False) -> Account:
        """Import (or refresh) an account from Enka, honouring the ttl it reports."""
        existing = self.find_account(uid)
        if existing is not None and not force and not existing.is_sync_due():
            return existing

        profile = parse_profile(self._enka.fetch_profile(uid), self._static)
        account = self._upsert_account(uid, profile)
        for parsed_agent in profile.agents:
            self._upsert_agent(account, parsed_agent)

        self._session.commit()
        self._session.refresh(account)
        return account

    def _upsert_account(self, uid: str, profile: ParsedProfile) -> Account:
        parsed = profile.account
        account = self.find_account(uid)
        if account is None:
            account = Account(uid=uid)
            self._session.add(account)

        account.nickname = parsed.nickname
        account.level = parsed.level
        account.signature = parsed.signature
        account.profile_id = parsed.profile_id
        account.avatar_id = parsed.avatar_id
        account.title_id = parsed.title_id
        account.calling_card_id = parsed.calling_card_id
        account.last_synced_at = utc_now()
        account.sync_ttl_seconds = profile.ttl or DEFAULT_SYNC_TTL_SECONDS
        self._session.flush()
        return account

    def _upsert_agent(self, account: Account, parsed: ParsedAgent) -> Agent | None:
        return self._write_build(account, parsed, SOURCE_ENKA)

    def _upsert_hoyolab_build(self, account: Account, parsed: ParsedAgent) -> Agent | None:
        return self._write_build(account, parsed, SOURCE_HOYOLAB)

    def _write_build(self, account: Account, parsed: ParsedAgent, source: str) -> Agent | None:
        """Write a whole build, whoever read it, unless the agent was edited by hand.

        Enka and HoYoLAB overwrite each other: the last sync to run wins, since both describe
        the build as the game has it. Only `manual` is protected, and it stays protected.
        """
        agent = self._find_agent(account.uid, parsed.game_id)

        if agent is not None and agent.is_manual:
            return None

        if agent is None:
            agent = Agent(account_uid=account.uid, game_id=parsed.game_id)
            self._session.add(agent)

        agent.level = parsed.level
        agent.promotion_level = parsed.promotion_level
        agent.mindscape_level = parsed.mindscape_level
        agent.core_skill_enhancement = parsed.core_skill_enhancement
        agent.skill_levels = dict(parsed.skill_levels)
        agent.weapon_effect_state = parsed.weapon_effect_state
        agent.obtained_at = parsed.obtained_at
        agent.source = source
        self._session.flush()

        self._replace_wengine(agent, parsed.wengine)
        self._replace_discs(agent, parsed.discs)
        return agent

    def _replace_wengine(self, agent: Agent, parsed: ParsedWEngine | None) -> None:
        if parsed is None:
            agent.wengine = None
            return
        wengine = agent.wengine or WEngine(agent_id=agent.id)
        wengine.game_id = parsed.game_id
        wengine.level = parsed.level
        wengine.modification_level = parsed.modification_level
        wengine.phase = parsed.phase
        wengine.item_uid = parsed.item_uid
        agent.wengine = wengine

    def _replace_discs(self, agent: Agent, discs: Sequence[ParsedDisc]) -> None:
        by_slot = {disc.slot: disc for disc in agent.discs}
        for parsed_disc in discs:
            disc = by_slot.pop(parsed_disc.slot, None) or DriveDisc(
                agent_id=agent.id, slot=parsed_disc.slot
            )
            disc.game_id = parsed_disc.game_id
            disc.set_id = parsed_disc.set_id
            disc.rarity = parsed_disc.rarity
            disc.level = parsed_disc.level
            disc.roll_count = parsed_disc.roll_count
            disc.main_stat_id = parsed_disc.main_stat.prop_id if parsed_disc.main_stat else None
            disc.main_stat_value = parsed_disc.main_stat.value if parsed_disc.main_stat else 0
            disc.substats = [stat.as_substat() for stat in parsed_disc.substats]
            disc.item_uid = parsed_disc.item_uid
            if disc not in agent.discs:
                agent.discs.append(disc)
        for stale in by_slot.values():
            agent.discs.remove(stale)

    def list_challenge_runs(self, uid: str, mode: str | None = None) -> list[ChallengeRun]:
        self.get_account(uid)
        query = select(ChallengeRun).where(ChallengeRun.account_uid == uid)
        if mode is not None:
            query = query.where(ChallengeRun.mode == mode)
        return list(
            self._session.scalars(
                query.order_by(ChallengeRun.mode, ChallengeRun.schedule_id.desc())
            )
        )

    def find_lost_void(self, uid: str) -> LostVoidProgress | None:
        self.get_account(uid)
        return self._session.get(LostVoidProgress, uid)

    def list_bangboos(self, uid: str) -> list[Bangboo]:
        self.get_account(uid)
        return list(
            self._session.scalars(
                select(Bangboo).where(Bangboo.account_uid == uid).order_by(Bangboo.game_id)
            )
        )

    def import_chronicle(
        self, uid: str, payloads: dict[str, Any], region: str = "", account_key: str = ""
    ) -> ChronicleImportReport:
        """Store a chronicle bundle captured in the user's browser, tracking the UID if new.

        The bundle carries the raw `data` of each endpoint, untouched, which is why the same
        mappers read it. Only `index` is mandatory, and any other absent or null section is
        skipped and reported.

        **A bundle proves nothing.** Every byte of it is chosen by whoever sends it, the UID
        it names included, and a UID is public. So the first import of a UID takes it —
        there is nothing there to take — and from then on the key is the only thing that
        speaks for the account: no bundle can talk over it, however well it names the UID.
        See `_ensure_import_allowed`. An owner who lost the key gets a new one from the CLI,
        which takes access to the database.
        No request leaves this backend: importing is the only way HoYoLAB data gets in.
        """
        index = _import_section(payloads, SECTION_INDEX)
        if not index:
            raise ValidationError("A chronicle import needs at least the index payload")
        record_card = _import_section(payloads, SECTION_RECORD_CARD)
        card = parse_record_card(record_card) if record_card else None
        claimed_uid = (card.uid if card else "") or parse_chronicle_uid(index)
        if claimed_uid and claimed_uid != uid:
            raise ValidationError(
                f"The imported chronicle belongs to UID {claimed_uid}, not to {uid}"
            )

        account = self._find_or_create_account(uid)
        self._ensure_import_allowed(account, account_key)

        bundle = ChroniclePayloads(
            region=self._import_region(account, region),
            source=CHRONICLE_SOURCE_EXTENSION,
            index=index,
            record_card=record_card,
            avatar_basic=_import_section(payloads, SECTION_AVATAR_BASIC),
            buddy_info=_import_section(payloads, SECTION_BUDDY_INFO),
            shiyu_defense=_import_seasons(payloads, SECTION_SHIYU_DEFENSE),
            deadly_assault=_import_seasons(payloads, SECTION_DEADLY_ASSAULT),
            lost_void=_import_section(payloads, SECTION_LOST_VOID),
            avatar_info=_import_builds(payloads),
        )
        report = self._persist_chronicle(account, bundle)
        return replace(report, account_key=self._claim_by_import(account, account_key))

    def _import_region(self, account: Account, region: str) -> str:
        """Take the region the bundle claims only if it is one that exists.

        The region is stored on the account and served with it, and it arrives in the body
        like everything else, so a typo — or a made-up string — would sit there being read
        as fact. Anything unrecognised falls back to what the UID itself implies, which is
        the answer that never depended on the caller.
        """
        if region in KNOWN_REGIONS:
            return region
        return self._region_for(account)

    def _ensure_import_allowed(self, account: Account, given: str) -> None:
        """Decide whether this bundle may be written into this account at all.

        An account with an owner takes the key and nothing else. A bundle cannot argue with
        it — naming the right UID costs nothing, since a UID is public — so there is no
        second door: no import, however complete, takes a UID that somebody already holds.
        An account nobody holds takes any bundle, because there is nothing there to take.
        """
        if not account.is_claimed:
            return
        if account.key is not None and keys.verify_key(account.key.key_hash, given):
            return
        raise ForbiddenError(
            f"Account {account.uid} already has an owner, so importing into it needs its "
            f"key in `X-Account-Key`; run `zzz-tracker rotate-key {account.uid}` where the "
            "database lives to issue a new one and invalidate the old"
        )

    def _claim_by_import(self, account: Account, given: str) -> str | None:
        """Hand out a key if this import just claimed the account, and nothing otherwise.

        Getting here with a key in force means the owner came back: the key stays, so
        importing twice never makes anyone write down a new secret. Getting here without
        one means the account had no owner a moment ago, and now it does.
        """
        if account.key is not None and keys.verify_key(account.key.key_hash, given):
            account.key.last_used_at = utc_now()
            self._session.commit()
            return None
        return self._issue_key(account)

    def _find_or_create_account(self, uid: str) -> Account:
        """Track the UID if it is new, surviving the race of two imports creating it at once."""
        account = self.find_account(uid)
        if account is not None:
            return account
        account = Account(uid=uid)
        self._session.add(account)
        try:
            self._session.flush()
        except IntegrityError:
            self._session.rollback()
            existing = self.find_account(uid)
            if existing is None:
                raise
            return existing
        return account

    def _persist_chronicle(
        self, account: Account, payloads: ChroniclePayloads
    ) -> ChronicleImportReport:
        skipped_sections: list[str] = []

        self._name_account(account, payloads)
        account.region = payloads.region
        account.chronicle_public = True

        agents_synced = 0
        if payloads.avatar_basic is None:
            skipped_sections.append(SECTION_AVATAR_BASIC)
        else:
            agents = parse_roster_agents(payloads.avatar_basic)
            agents_synced = sum(
                1 for parsed in agents if self._upsert_roster_agent(account, parsed)
            )

        bangboos_synced = 0
        if payloads.buddy_info is None:
            skipped_sections.append(SECTION_BUDDY_INFO)
        else:
            bangboos = parse_bangboos(payloads.buddy_info)
            for parsed_bangboo in bangboos:
                self._upsert_bangboo(account, parsed_bangboo)
            bangboos_synced = len(bangboos)

        unavailable: list[str] = []
        runs = self._persist_challenge_runs(account, payloads, unavailable, skipped_sections)

        lost_void = None
        if payloads.lost_void is None:
            skipped_sections.append(SECTION_LOST_VOID)
        else:
            lost_void = parse_lost_void(payloads.lost_void)
            if lost_void is not None:
                self._upsert_lost_void(account, lost_void)

        builds_synced = 0
        if not payloads.avatar_info:
            skipped_sections.append(SECTION_AVATAR_INFO)
        else:
            builds_synced = self._persist_builds(account, payloads.avatar_info)

        account.chronicle_synced_at = utc_now()
        account.chronicle_import_source = payloads.source

        self._session.commit()
        self._session.refresh(account)
        return ChronicleImportReport(
            account=account,
            runs=tuple(runs),
            agents_synced=agents_synced,
            bangboos_synced=bangboos_synced,
            builds_synced=builds_synced,
            lost_void_synced=lost_void is not None,
            unavailable_modes=tuple(dict.fromkeys(unavailable)),
            skipped_sections=tuple(skipped_sections),
        )

    def _name_account(self, account: Account, payloads: ChroniclePayloads) -> None:
        """Give the account its nickname and level, from whichever payload happens to know.

        The record card is the only one that answers for sure, and a capture often comes
        without it. Failing that, the `index` is asked (it does carry a profile in some
        versions) and finally the challenge payloads, which sign their answer with
        `nick_name` and are the last chance to learn the name at all.
        """
        card = parse_record_card(payloads.record_card) if payloads.record_card else None
        profile = parse_chronicle_account(payloads.index)

        nickname = (card.nickname if card else "") or (profile.nickname if profile else "")
        level = (card.level if card else 0) or (profile.level if profile else 0)

        account.nickname = nickname or self._nickname_from_challenges(payloads) or account.nickname
        account.level = level or account.level

    def _nickname_from_challenges(self, payloads: ChroniclePayloads) -> str:
        seasons = (*payloads.shiyu_defense.values(), *payloads.deadly_assault.values())
        for season in seasons:
            nickname = parse_challenge_nickname(season)
            if nickname:
                return nickname
        return ""

    def _persist_challenge_runs(
        self,
        account: Account,
        payloads: ChroniclePayloads,
        unavailable: list[str],
        skipped_sections: list[str],
    ) -> list[ChallengeRun]:
        sections = (
            (SECTION_SHIYU_DEFENSE, payloads.shiyu_defense, parse_shiyu_defense),
            (SECTION_DEADLY_ASSAULT, payloads.deadly_assault, parse_deadly_assault),
        )
        runs: list[ChallengeRun] = []
        seen_seasons: set[tuple[str, int]] = set()
        for schedule_type in sorted({*payloads.shiyu_defense, *payloads.deadly_assault}):
            for _, seasons, parse in sections:
                payload = seasons.get(schedule_type)
                if payload is None:
                    continue
                parsed = parse(payload)
                if parsed is None:
                    continue
                season = (parsed.mode, parsed.schedule_id)
                if season in seen_seasons:
                    continue
                seen_seasons.add(season)
                if not parsed.has_data:
                    unavailable.append(parsed.mode)
                    continue
                runs.append(self._upsert_challenge_run(account, parsed))
        for name, seasons, _ in sections:
            if not seasons:
                skipped_sections.append(name)
        return runs

    def _upsert_challenge_run(self, account: Account, parsed: ParsedChallengeRun) -> ChallengeRun:
        run = self._session.scalars(
            select(ChallengeRun).where(
                ChallengeRun.account_uid == account.uid,
                ChallengeRun.mode == parsed.mode,
                ChallengeRun.schedule_id == parsed.schedule_id,
            )
        ).one_or_none()
        if run is None:
            run = ChallengeRun(
                account_uid=account.uid,
                mode=parsed.mode,
                schedule_id=parsed.schedule_id,
            )
            self._session.add(run)

        run.begin_time = parsed.begin_time
        run.end_time = parsed.end_time
        run.has_data = parsed.has_data
        run.rating = parsed.rating
        run.score = parsed.score
        run.max_score = parsed.max_score
        run.total_stars = parsed.total_stars
        run.rank_percent = parsed.rank_percent
        run.clear_time_seconds = parsed.clear_time_seconds
        run.schema_version = parsed.schema_version
        run.raw = parsed.raw
        run.synced_at = utc_now()
        self._session.flush()

        run.entries.clear()
        self._session.flush()
        for parsed_entry in parsed.entries:
            run.entries.append(
                ChallengeRunEntry(
                    position=parsed_entry.position,
                    layer_index=parsed_entry.layer_index,
                    layer_id=parsed_entry.layer_id,
                    name=parsed_entry.name,
                    rating=parsed_entry.rating,
                    score=parsed_entry.score,
                    max_score=parsed_entry.max_score,
                    stars=parsed_entry.stars,
                    clear_time_seconds=parsed_entry.clear_time_seconds,
                    challenged_at=parsed_entry.challenged_at,
                    boss_name=parsed_entry.boss_name,
                    boss_icon=parsed_entry.boss_icon,
                    buffs=[dict(buff) for buff in parsed_entry.buffs],
                    agents=[agent.as_snapshot() for agent in parsed_entry.agents],
                    bangboo_id=parsed_entry.bangboo_id,
                )
            )
        self._session.flush()
        return run

    def _upsert_roster_agent(self, account: Account, parsed: ParsedRosterAgent) -> bool:
        agent = self._find_agent(account.uid, parsed.game_id)
        if agent is not None and agent.is_manual:
            return False

        if agent is None:
            agent = Agent(
                account_uid=account.uid,
                game_id=parsed.game_id,
                source=SOURCE_HOYOLAB,
            )
            self._session.add(agent)

        agent.level = parsed.level
        agent.mindscape_level = parsed.mindscape_level
        self._session.flush()
        return True

    def _persist_builds(self, account: Account, payloads: Sequence[dict[str, Any]]) -> int:
        """Store the whole build of every agent the chronicle answered for.

        This runs after the roster so the complete build wins over the level and mindscape
        `avatar_basic` brought for the same agent. The raw payload is kept next to the build:
        it costs one row per agent and it is the only way to recover a field the mapper does
        not read yet without asking HoYoLAB again.
        """
        for game_id, raw in raw_agents(payloads):
            self._upsert_build_snapshot(account, game_id, raw)
        builds = parse_agent_builds(payloads, self._static)
        return sum(1 for parsed in builds if self._upsert_hoyolab_build(account, parsed))

    def _upsert_build_snapshot(self, account: Account, game_id: int, raw: dict[str, Any]) -> None:
        snapshot = self._session.scalars(
            select(AgentBuildSnapshot).where(
                AgentBuildSnapshot.account_uid == account.uid,
                AgentBuildSnapshot.game_id == game_id,
            )
        ).one_or_none()
        if snapshot is None:
            snapshot = AgentBuildSnapshot(account_uid=account.uid, game_id=game_id)
            self._session.add(snapshot)

        snapshot.raw = raw
        snapshot.captured_at = utc_now()
        self._session.flush()

    def _upsert_bangboo(self, account: Account, parsed: ParsedBangboo) -> Bangboo:
        bangboo = self._session.scalars(
            select(Bangboo).where(
                Bangboo.account_uid == account.uid, Bangboo.game_id == parsed.game_id
            )
        ).one_or_none()
        if bangboo is None:
            bangboo = Bangboo(account_uid=account.uid, game_id=parsed.game_id)
            self._session.add(bangboo)

        bangboo.name = parsed.name
        bangboo.level = parsed.level
        bangboo.rarity = parsed.rarity
        bangboo.star = parsed.star
        bangboo.icon = parsed.icon
        self._session.flush()
        return bangboo

    def _upsert_lost_void(self, account: Account, parsed: ParsedLostVoid) -> LostVoidProgress:
        progress = self._session.get(LostVoidProgress, account.uid)
        if progress is None:
            progress = LostVoidProgress(account_uid=account.uid)
            self._session.add(progress)

        progress.license_level = parsed.license_level
        progress.exploration_log = parsed.exploration_log
        progress.max_exploration_log = parsed.max_exploration_log
        progress.commissions_done = parsed.commissions_done
        progress.commissions_total = parsed.commissions_total
        progress.ultimate_challenge_score = parsed.ultimate_challenge_score
        progress.ultimate_challenge_tier = parsed.ultimate_challenge_tier
        progress.data_collected = parsed.data_collected
        progress.raw = parsed.raw
        progress.synced_at = utc_now()
        self._session.flush()
        return progress

    def _region_for(self, account: Account) -> str:
        region = account.region or region_for_uid(account.uid)
        if region == CHINA_REGION:
            raise ValidationError(
                f"UID {account.uid} belongs to the Chinese client, which this tracker "
                "cannot read from HoYoLAB"
            )
        return region
