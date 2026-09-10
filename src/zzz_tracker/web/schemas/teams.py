from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.models import Team, as_utc
from zzz_tracker.tracker.service import TEAM_SLOTS, TeamEdit, TeamMemberEdit
from zzz_tracker.web.schemas.agents import AgentRead


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
