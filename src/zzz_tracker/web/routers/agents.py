"""The roster and the build behind each agent.

Unlike the catalog, these endpoints still answer when the static data is missing, with
`null` names. Anything written by hand is marked `manual` and survives every later sync.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response, status

from zzz_tracker.web.deps import (
    AgentIdPath,
    StaticDataDep,
    TrackerServiceDep,
    UidPath,
    require_account_key,
    require_agent_owner_key,
)
from zzz_tracker.web.schemas import (
    AgentDetailRead,
    AgentListResponse,
    AgentRead,
    AgentUpdate,
    AgentWrite,
    ErrorResponse,
)

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "The account or agent is not tracked"}
}
WRITE_ERRORS: dict[int | str, dict[str, Any]] = {
    **NOT_FOUND,
    403: {"model": ErrorResponse, "description": "The account key is missing or not this one"},
    409: {
        "model": ErrorResponse,
        "description": "The account has no owner yet, or already tracks that agent",
    },
    422: {"model": ErrorResponse, "description": "The build breaks a rule, e.g. a repeated slot"},
}

router = APIRouter(tags=["agents"], responses=NOT_FOUND)


@router.get("/accounts/{uid}/agents", response_model=AgentListResponse)
def list_account_agents(
    uid: UidPath, service: TrackerServiceDep, static: StaticDataDep
) -> AgentListResponse:
    """The roster: every agent tracked for the account, imported or added by hand."""
    agents = service.list_agents(uid)
    return AgentListResponse(items=[AgentRead.from_agent(agent, static) for agent in agents])


@router.post(
    "/accounts/{uid}/agents",
    response_model=AgentDetailRead,
    status_code=status.HTTP_201_CREATED,
    responses=WRITE_ERRORS,
    dependencies=[Depends(require_account_key)],
)
def create_account_agent(
    uid: UidPath, payload: AgentWrite, service: TrackerServiceDep, static: StaticDataDep
) -> AgentDetailRead:
    """Add an agent the showcase never exposed, with the build the player typed in."""
    agent = service.create_agent(uid, payload.as_parsed_agent(static))
    return AgentDetailRead.from_agent(agent, static)


@router.get("/agents/{agent_id}", response_model=AgentDetailRead)
def get_agent(
    agent_id: AgentIdPath, service: TrackerServiceDep, static: StaticDataDep
) -> AgentDetailRead:
    """A single agent with its full build: W-Engine, drive discs and equipped sets."""
    return AgentDetailRead.from_agent(service.get_agent(agent_id), static)


@router.patch(
    "/agents/{agent_id}",
    response_model=AgentDetailRead,
    responses=WRITE_ERRORS,
    dependencies=[Depends(require_agent_owner_key)],
)
def update_agent(
    agent_id: AgentIdPath,
    payload: AgentUpdate,
    service: TrackerServiceDep,
    static: StaticDataDep,
) -> AgentDetailRead:
    """Correct an agent. The W-Engine and the discs are replaced, not merged."""
    agent = service.update_agent(agent_id, payload.as_edit(static))
    return AgentDetailRead.from_agent(agent, static)


@router.delete(
    "/agents/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=WRITE_ERRORS,
    dependencies=[Depends(require_agent_owner_key)],
)
def delete_agent(agent_id: AgentIdPath, service: TrackerServiceDep) -> Response:
    """Stop tracking an agent, with its build.

    A team comp that fielded it loses that slot and keeps the rest of its members.
    """
    service.delete_agent(agent_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
