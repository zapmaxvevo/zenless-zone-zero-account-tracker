from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from zzz_tracker.errors import NotFoundError, ValidationError
from zzz_tracker.storage.models import Team, TeamMember
from zzz_tracker.tracker.accounts import AccountService
from zzz_tracker.tracker.agents import AgentService

TEAM_SLOTS = 3


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


class TeamService:
    """Team comps, each holding up to three agents of its own account."""

    def __init__(self, session: Session, accounts: AccountService, agents: AgentService) -> None:
        self._session = session
        self._accounts = accounts
        self._agents = agents

    def list_teams(self, uid: str) -> list[Team]:
        self._accounts.get_account(uid)
        return list(
            self._session.scalars(select(Team).where(Team.account_uid == uid).order_by(Team.id))
        )

    def get_team(self, team_id: int) -> Team:
        team = self._session.get(Team, team_id)
        if team is None:
            raise NotFoundError(f"Team {team_id} does not exist")
        return team

    def create_team(self, uid: str, edit: TeamEdit) -> Team:
        account = self._accounts.get_account(uid)
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
            agent = self._agents.get_agent(agent_id)
            if agent.account_uid != uid:
                raise ValidationError(f"Agent {agent_id} does not belong to account {uid}")
