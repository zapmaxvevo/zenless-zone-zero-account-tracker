"""Team comps: named groups of up to three agents of a tracked account.

Teams are written whole: `POST` and `PUT` both carry the complete comp. Members come back
with the agent already resolved, the same shape the roster serves.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response, status

from zzz_tracker.web.deps import (
    StaticDataDep,
    TeamIdPath,
    TrackerServiceDep,
    UidPath,
    require_account_key,
    require_team_owner_key,
)
from zzz_tracker.web.schemas import (
    ErrorResponse,
    TeamListResponse,
    TeamRead,
    TeamWrite,
)

TEAM_ERRORS: dict[int | str, dict[str, Any]] = {
    403: {"model": ErrorResponse, "description": "The account key is missing or not this one"},
    404: {"model": ErrorResponse, "description": "The account, the team or an agent is missing"},
    409: {"model": ErrorResponse, "description": "The account has no owner to write on behalf of"},
    422: {"model": ErrorResponse, "description": "The comp breaks a slot or ownership rule"},
}

router = APIRouter(tags=["teams"], responses=TEAM_ERRORS)


@router.get("/accounts/{uid}/teams", response_model=TeamListResponse)
def list_account_teams(
    uid: UidPath, service: TrackerServiceDep, static: StaticDataDep
) -> TeamListResponse:
    teams = service.list_teams(uid)
    return TeamListResponse(items=[TeamRead.from_team(team, static) for team in teams])


@router.post(
    "/accounts/{uid}/teams",
    response_model=TeamRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_account_key)],
)
def create_team(
    uid: UidPath, payload: TeamWrite, service: TrackerServiceDep, static: StaticDataDep
) -> TeamRead:
    """Save a comp for the account. Every member must be an agent of that same account."""
    team = service.create_team(uid, payload.as_edit())
    return TeamRead.from_team(team, static)


@router.get("/teams/{team_id}", response_model=TeamRead)
def get_team(team_id: TeamIdPath, service: TrackerServiceDep, static: StaticDataDep) -> TeamRead:
    return TeamRead.from_team(service.get_team(team_id), static)


@router.put(
    "/teams/{team_id}",
    response_model=TeamRead,
    dependencies=[Depends(require_team_owner_key)],
)
def update_team(
    team_id: TeamIdPath, payload: TeamWrite, service: TrackerServiceDep, static: StaticDataDep
) -> TeamRead:
    """Replace the comp: the members sent become the whole team."""
    team = service.update_team(team_id, payload.as_edit())
    return TeamRead.from_team(team, static)


@router.delete(
    "/teams/{team_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_team_owner_key)],
)
def delete_team(team_id: TeamIdPath, service: TrackerServiceDep) -> Response:
    """Drop the comp. The agents it grouped stay tracked."""
    service.delete_team(team_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
