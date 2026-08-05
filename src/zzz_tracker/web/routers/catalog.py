"""Read-only views over Enka's static data, for pickers and for rendering raw game ids.

The whole catalog depends on files the operator downloads with `zzz-tracker sync-static`.
While they are missing every endpoint here answers `503` with an `ErrorResponse` telling
how to get them, rather than an empty list: an empty catalog is indistinguishable from a
game with no agents, and would leave the frontend rendering silently broken pickers.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from zzz_tracker.web.deps import RequiredStaticDataDep
from zzz_tracker.web.schemas import (
    CatalogAgentListResponse,
    CatalogAgentRead,
    CatalogDiscSetListResponse,
    CatalogDiscSetRead,
    CatalogPropertyListResponse,
    CatalogPropertyRead,
    CatalogWEngineListResponse,
    CatalogWEngineRead,
    ErrorResponse,
)

STATIC_DATA_MISSING: dict[int | str, dict[str, Any]] = {
    503: {
        "model": ErrorResponse,
        "description": "Enka's static data has not been downloaded yet",
    }
}

router = APIRouter(prefix="/catalog", tags=["catalog"], responses=STATIC_DATA_MISSING)


@router.get("/agents", response_model=CatalogAgentListResponse)
def list_agents(static: RequiredStaticDataDep) -> CatalogAgentListResponse:
    """Every agent the game knows about, for pickers and for rendering unknown ids."""
    items = []
    for game_id in static.agent_ids():
        info = static.agent(game_id)
        if info is None:
            continue
        items.append(
            CatalogAgentRead(
                game_id=info.game_id,
                name=info.name,
                rarity=info.rarity,
                profession=info.profession,
                elements=list(info.elements),
                image_url=info.image_url,
                icon_url=info.circle_icon_url,
            )
        )
    return CatalogAgentListResponse(items=items)


@router.get("/wengines", response_model=CatalogWEngineListResponse)
def list_wengines(static: RequiredStaticDataDep) -> CatalogWEngineListResponse:
    items = []
    for game_id in static.wengine_ids():
        info = static.wengine(game_id)
        if info is None:
            continue
        items.append(
            CatalogWEngineRead(
                game_id=info.game_id,
                name=info.name,
                rarity=info.rarity,
                profession=info.profession,
                image_url=info.image_url,
            )
        )
    return CatalogWEngineListResponse(items=items)


@router.get("/discs", response_model=CatalogDiscSetListResponse)
def list_disc_sets(static: RequiredStaticDataDep) -> CatalogDiscSetListResponse:
    items = []
    for set_id in static.disc_set_ids():
        info = static.disc_set(set_id)
        if info is None:
            continue
        items.append(
            CatalogDiscSetRead(
                set_id=info.set_id,
                name=info.name,
                icon_url=info.icon_url,
                bonus_props=dict(info.set_bonus),
            )
        )
    return CatalogDiscSetListResponse(items=items)


@router.get("/properties", response_model=CatalogPropertyListResponse)
def list_properties(static: RequiredStaticDataDep) -> CatalogPropertyListResponse:
    """Stat properties that can be named; ids Enka leaves unnamed are left out."""
    items = []
    for prop_id in static.property_ids():
        info = static.property(prop_id)
        if info is None or not info.name:
            continue
        items.append(
            CatalogPropertyRead(prop_id=info.property_id, name=info.name, format=info.format)
        )
    return CatalogPropertyListResponse(items=items)
