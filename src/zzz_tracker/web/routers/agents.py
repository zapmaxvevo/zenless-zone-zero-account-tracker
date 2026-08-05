"""The roster and the build behind each agent.

Every name, icon and stat label is resolved here from Enka's static data, so the frontend
never sees a raw game id it has to look up. Unlike the catalog, these endpoints still answer
when the static data is missing: what the player owns is worth showing with `null` names.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path

from zzz_tracker.web.deps import StaticDataDep, TrackerServiceDep
from zzz_tracker.web.schemas import (
    UID_PATTERN,
    AgentDetailRead,
    AgentListResponse,
    AgentRead,
    ErrorResponse,
)

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "The account or agent is not tracked"}
}

router = APIRouter(tags=["agents"], responses=NOT_FOUND)

UidPath = Annotated[
    str, Path(pattern=UID_PATTERN, description="In-game UID of the tracked account")
]
AgentIdPath = Annotated[int, Path(ge=1, description="Tracked agent id")]


@router.get("/accounts/{uid}/agents", response_model=AgentListResponse)
def list_account_agents(
    uid: UidPath, service: TrackerServiceDep, static: StaticDataDep
) -> AgentListResponse:
    """The roster: every agent tracked for the account, imported or added by hand."""
    agents = service.list_agents(uid)
    return AgentListResponse(items=[AgentRead.from_agent(agent, static) for agent in agents])


@router.get("/agents/{agent_id}", response_model=AgentDetailRead)
def get_agent(
    agent_id: AgentIdPath, service: TrackerServiceDep, static: StaticDataDep
) -> AgentDetailRead:
    """A single agent with its full build: W-Engine, drive discs and equipped sets."""
    return AgentDetailRead.from_agent(service.get_agent(agent_id), static)
