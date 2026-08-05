from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.mapper import ParsedAgent, ParsedProfile, parse_profile
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import NotFoundError, ValidationError
from zzz_tracker.storage.models import (
    SOURCE_ENKA,
    Account,
    Agent,
    DriveDisc,
    Team,
    TeamMember,
    WEngine,
    utc_now,
)

DEFAULT_SYNC_TTL_SECONDS = 60
TEAM_SLOTS = 3
DISC_SLOTS = 6


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


class TrackerService:
    """Use cases around tracked accounts: importing from Enka and reading them back.

    Sync never overwrites hand-edited data: agents whose `source` is `manual` are left
    untouched, and agents missing from the showcase are kept rather than deleted, since
    Enka only exposes the handful of agents the player put on display.
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
        agent = self._session.scalars(
            select(Agent).where(
                Agent.account_uid == account.uid,
                Agent.game_id == parsed.game_id,
            )
        ).one_or_none()

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
        agent.source = SOURCE_ENKA
        self._session.flush()

        self._replace_wengine(agent, parsed)
        self._replace_discs(agent, parsed)
        return agent

    def _replace_wengine(self, agent: Agent, parsed: ParsedAgent) -> None:
        if parsed.wengine is None:
            agent.wengine = None
            return
        wengine = agent.wengine or WEngine(agent_id=agent.id)
        wengine.game_id = parsed.wengine.game_id
        wengine.level = parsed.wengine.level
        wengine.modification_level = parsed.wengine.modification_level
        wengine.phase = parsed.wengine.phase
        wengine.item_uid = parsed.wengine.item_uid
        agent.wengine = wengine

    def _replace_discs(self, agent: Agent, parsed: ParsedAgent) -> None:
        by_slot = {disc.slot: disc for disc in agent.discs}
        for parsed_disc in parsed.discs:
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
