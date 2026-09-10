"""The tracker's use cases, as one facade over the services that own each concern."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.mapper import ParsedAgent
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.models import (
    Account,
    Agent,
    Bangboo,
    ChallengeRun,
    LostVoidProgress,
    Team,
)
from zzz_tracker.tracker.accounts import AccountService
from zzz_tracker.tracker.agents import DISC_SLOTS, AgentEdit, AgentService
from zzz_tracker.tracker.chronicle import (
    ChronicleImporter,
    ChronicleImportReport,
    ChroniclePayloads,
)
from zzz_tracker.tracker.enka_sync import DEFAULT_SYNC_TTL_SECONDS, EnkaSyncService
from zzz_tracker.tracker.teams import TEAM_SLOTS, TeamEdit, TeamMemberEdit, TeamService

__all__ = [
    "DEFAULT_SYNC_TTL_SECONDS",
    "DISC_SLOTS",
    "TEAM_SLOTS",
    "AgentEdit",
    "ChronicleImportReport",
    "ChroniclePayloads",
    "TeamEdit",
    "TeamMemberEdit",
    "TrackerService",
]


class TrackerService:
    """Tracked accounts, agents, teams and imports. A sync never overwrites a `manual` agent."""

    def __init__(
        self,
        session: Session,
        enka: EnkaClient,
        static: StaticData | None = None,
    ) -> None:
        self._session = session
        self._accounts = AccountService(session)
        self._agents = AgentService(session, self._accounts)
        self._teams = TeamService(session, self._accounts, self._agents)
        self._enka_sync = EnkaSyncService(session, self._accounts, self._agents, enka, static)
        self._chronicle = ChronicleImporter(session, self._accounts, self._agents, static)

    def list_accounts(self) -> list[Account]:
        return self._accounts.list_accounts()

    def find_account(self, uid: str) -> Account | None:
        return self._accounts.find_account(uid)

    def get_account(self, uid: str) -> Account:
        return self._accounts.get_account(uid)

    def claim_account(self, uid: str) -> str:
        return self._accounts.claim_account(uid)

    def rotate_key(self, uid: str) -> str:
        return self._accounts.rotate_key(uid)

    def verify_key(self, uid: str, given: str) -> bool:
        return self._accounts.verify_key(uid, given)

    def account_uid_for_agent(self, agent_id: int) -> str:
        """Which account owns an agent, since agent ids are global and name no UID."""
        return self._agents.get_agent(agent_id).account_uid

    def account_uid_for_team(self, team_id: int) -> str:
        return self._teams.get_team(team_id).account_uid

    def list_agents(self, uid: str) -> list[Agent]:
        return self._agents.list_agents(uid)

    def get_agent(self, agent_id: int) -> Agent:
        return self._agents.get_agent(agent_id)

    def create_agent(self, uid: str, parsed: ParsedAgent) -> Agent:
        return self._agents.create_agent(uid, parsed)

    def update_agent(self, agent_id: int, edit: AgentEdit) -> Agent:
        return self._agents.update_agent(agent_id, edit)

    def delete_agent(self, agent_id: int) -> None:
        self._agents.delete_agent(agent_id)

    def list_teams(self, uid: str) -> list[Team]:
        return self._teams.list_teams(uid)

    def get_team(self, team_id: int) -> Team:
        return self._teams.get_team(team_id)

    def create_team(self, uid: str, edit: TeamEdit) -> Team:
        return self._teams.create_team(uid, edit)

    def update_team(self, team_id: int, edit: TeamEdit) -> Team:
        return self._teams.update_team(team_id, edit)

    def delete_team(self, team_id: int) -> None:
        self._teams.delete_team(team_id)

    def sync_account(self, uid: str, force: bool = False) -> Account:
        return self._enka_sync.sync_account(uid, force=force)

    def list_challenge_runs(self, uid: str, mode: str | None = None) -> list[ChallengeRun]:
        return self._chronicle.list_challenge_runs(uid, mode)

    def find_lost_void(self, uid: str) -> LostVoidProgress | None:
        return self._chronicle.find_lost_void(uid)

    def list_bangboos(self, uid: str) -> list[Bangboo]:
        return self._chronicle.list_bangboos(uid)

    def import_chronicle(
        self, uid: str, payloads: dict[str, Any], region: str = "", account_key: str = ""
    ) -> ChronicleImportReport:
        return self._chronicle.import_chronicle(
            uid, payloads, region=region, account_key=account_key
        )
