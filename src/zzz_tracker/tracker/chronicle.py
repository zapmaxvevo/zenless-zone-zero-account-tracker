from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import ForbiddenError, ValidationError
from zzz_tracker.hoyolab.build_mapper import parse_agent_builds, raw_agents
from zzz_tracker.hoyolab.mapper import (
    ParsedBangboo,
    ParsedChallengeEntry,
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
    CHRONICLE_SOURCE_EXTENSION,
    KNOWN_REGIONS,
    SOURCE_HOYOLAB,
    Account,
    Agent,
    AgentBuildSnapshot,
    Bangboo,
    ChallengeRun,
    ChallengeRunEntry,
    LostVoidProgress,
    utc_now,
)
from zzz_tracker.tracker.accounts import AccountService
from zzz_tracker.tracker.agents import AgentService
from zzz_tracker.tracker.rows import copy_fields, get_or_create

SECTION_INDEX = "index"
SECTION_RECORD_CARD = "record_card"
SECTION_AVATAR_BASIC = "avatar_basic"
SECTION_AVATAR_INFO = "avatar_info"
SECTION_BUDDY_INFO = "buddy_info"
SECTION_SHIYU_DEFENSE = "shiyu_defense"
SECTION_DEADLY_ASSAULT = "deadly_assault"
SECTION_LOST_VOID = "lost_void"

CHALLENGE_RUN_FIELDS = (
    "begin_time",
    "end_time",
    "has_data",
    "rating",
    "score",
    "max_score",
    "total_stars",
    "rank_percent",
    "clear_time_seconds",
    "schema_version",
    "raw",
)
# `buffs` and `agents` are left out: they are JSON copies of a parsed structure, not attributes.
CHALLENGE_ENTRY_FIELDS = (
    "position",
    "layer_index",
    "layer_id",
    "name",
    "rating",
    "score",
    "max_score",
    "stars",
    "clear_time_seconds",
    "challenged_at",
    "boss_name",
    "boss_icon",
    "bangboo_id",
)
BANGBOO_FIELDS = ("name", "level", "rarity", "star", "icon")
LOST_VOID_FIELDS = (
    "license_level",
    "exploration_log",
    "max_exploration_log",
    "commissions_done",
    "commissions_total",
    "ultimate_challenge_score",
    "ultimate_challenge_tier",
    "data_collected",
    "raw",
)

_Payload = TypeVar("_Payload")


@dataclass(frozen=True, slots=True)
class ChroniclePayloads:
    """The raw `data` of every chronicle endpoint; only `index` is mandatory."""

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


class ChronicleImporter:
    """Storing a Battle Chronicle bundle captured in the user's browser, and reading it back."""

    def __init__(
        self,
        session: Session,
        accounts: AccountService,
        agents: AgentService,
        static: StaticData | None = None,
    ) -> None:
        self._session = session
        self._accounts = accounts
        self._agents = agents
        self._static = static

    def list_challenge_runs(self, uid: str, mode: str | None = None) -> list[ChallengeRun]:
        self._accounts.get_account(uid)
        query = select(ChallengeRun).where(ChallengeRun.account_uid == uid)
        if mode is not None:
            query = query.where(ChallengeRun.mode == mode)
        return list(
            self._session.scalars(
                query.order_by(ChallengeRun.mode, ChallengeRun.schedule_id.desc())
            )
        )

    def find_lost_void(self, uid: str) -> LostVoidProgress | None:
        self._accounts.get_account(uid)
        return self._session.get(LostVoidProgress, uid)

    def list_bangboos(self, uid: str) -> list[Bangboo]:
        self._accounts.get_account(uid)
        return list(
            self._session.scalars(
                select(Bangboo).where(Bangboo.account_uid == uid).order_by(Bangboo.game_id)
            )
        )

    def import_chronicle(
        self, uid: str, payloads: dict[str, Any], region: str = "", account_key: str = ""
    ) -> ChronicleImportReport:
        """Store a chronicle bundle captured in the user's browser, tracking the UID if new."""
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

        account = self._accounts.find_or_create(uid)
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
        """Take the region the bundle claims only if it is one that exists."""
        if region in KNOWN_REGIONS:
            return region
        return self._accounts.region_for(account)

    def _ensure_import_allowed(self, account: Account, given: str) -> None:
        """An account with an owner takes its key and nothing else; an unowned one takes any."""
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
        """Hand out a key if this import just claimed the account, and nothing otherwise."""
        if account.key is not None and keys.verify_key(account.key.key_hash, given):
            account.key.last_used_at = utc_now()
            self._session.commit()
            return None
        return self._accounts.issue_key(account)

    def _persist_chronicle(
        self, account: Account, payloads: ChroniclePayloads
    ) -> ChronicleImportReport:
        skipped: list[str] = []
        unavailable: list[str] = []

        self._name_account(account, payloads)
        account.region = payloads.region
        account.chronicle_public = True

        # Order matters: it is the reported order of `skipped_sections`, and the builds run last.
        agents_synced = self._persist_section(
            skipped,
            SECTION_AVATAR_BASIC,
            payloads.avatar_basic,
            lambda section: self._persist_roster(account, section),
        )
        bangboos_synced = self._persist_section(
            skipped,
            SECTION_BUDDY_INFO,
            payloads.buddy_info,
            lambda section: self._persist_bangboos(account, section),
        )
        runs = self._persist_challenge_runs(account, payloads, unavailable, skipped)
        lost_void_synced = bool(
            self._persist_section(
                skipped,
                SECTION_LOST_VOID,
                payloads.lost_void,
                lambda section: self._persist_lost_void(account, section),
            )
        )
        builds_synced = self._persist_section(
            skipped,
            SECTION_AVATAR_INFO,
            payloads.avatar_info or None,
            lambda section: self._persist_builds(account, section),
        )

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
            lost_void_synced=lost_void_synced,
            unavailable_modes=tuple(dict.fromkeys(unavailable)),
            skipped_sections=tuple(skipped),
        )

    def _persist_section(
        self,
        skipped: list[str],
        name: str,
        payload: _Payload | None,
        persist: Callable[[_Payload], int],
    ) -> int:
        """Persist one optional section, or note that the capture came without it."""
        if payload is None:
            skipped.append(name)
            return 0
        return persist(payload)

    def _name_account(self, account: Account, payloads: ChroniclePayloads) -> None:
        """Give the account its nickname and level, from whichever payload happens to know."""
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

    def _persist_roster(self, account: Account, payload: dict[str, Any]) -> int:
        agents = parse_roster_agents(payload)
        return sum(1 for parsed in agents if self._upsert_roster_agent(account, parsed))

    def _persist_bangboos(self, account: Account, payload: dict[str, Any]) -> int:
        bangboos = parse_bangboos(payload)
        for parsed in bangboos:
            self._upsert_bangboo(account, parsed)
        return len(bangboos)

    def _persist_lost_void(self, account: Account, payload: dict[str, Any]) -> int:
        parsed = parse_lost_void(payload)
        if parsed is None:
            return 0
        self._upsert_lost_void(account, parsed)
        return 1

    def _persist_builds(self, account: Account, payloads: Sequence[dict[str, Any]]) -> int:
        """Store the whole build of every agent the chronicle answered for."""
        for game_id, raw in raw_agents(payloads):
            self._upsert_build_snapshot(account, game_id, raw)
        builds = parse_agent_builds(payloads, self._static)
        return sum(1 for parsed in builds if self._agents.upsert_hoyolab_build(account, parsed))

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
        run = get_or_create(
            self._session,
            ChallengeRun,
            account_uid=account.uid,
            mode=parsed.mode,
            schedule_id=parsed.schedule_id,
        )
        copy_fields(run, parsed, CHALLENGE_RUN_FIELDS)
        run.synced_at = utc_now()
        self._session.flush()

        # The entries are rewritten rather than matched: a re-run changes which layers exist.
        run.entries.clear()
        self._session.flush()
        for parsed_entry in parsed.entries:
            run.entries.append(_challenge_entry(parsed_entry))
        self._session.flush()
        return run

    def _upsert_roster_agent(self, account: Account, parsed: ParsedRosterAgent) -> bool:
        agent = self._agents.find_agent(account.uid, parsed.game_id)
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

    def _upsert_build_snapshot(self, account: Account, game_id: int, raw: dict[str, Any]) -> None:
        snapshot = get_or_create(
            self._session, AgentBuildSnapshot, account_uid=account.uid, game_id=game_id
        )
        snapshot.raw = raw
        snapshot.captured_at = utc_now()
        self._session.flush()

    def _upsert_bangboo(self, account: Account, parsed: ParsedBangboo) -> Bangboo:
        bangboo = get_or_create(
            self._session, Bangboo, account_uid=account.uid, game_id=parsed.game_id
        )
        copy_fields(bangboo, parsed, BANGBOO_FIELDS)
        self._session.flush()
        return bangboo

    def _upsert_lost_void(self, account: Account, parsed: ParsedLostVoid) -> LostVoidProgress:
        progress = get_or_create(self._session, LostVoidProgress, account_uid=account.uid)
        copy_fields(progress, parsed, LOST_VOID_FIELDS)
        progress.synced_at = utc_now()
        self._session.flush()
        return progress


def _challenge_entry(parsed: ParsedChallengeEntry) -> ChallengeRunEntry:
    entry = ChallengeRunEntry(
        buffs=[dict(buff) for buff in parsed.buffs],
        agents=[agent.as_snapshot() for agent in parsed.agents],
    )
    copy_fields(entry, parsed, CHALLENGE_ENTRY_FIELDS)
    return entry
