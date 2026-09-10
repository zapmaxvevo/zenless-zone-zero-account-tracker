"""Read-only views over Enka's static data, for pickers and for rendering raw game ids.

Without the files `zzz-tracker sync-static` downloads, every endpoint here answers `503`
rather than an empty list.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from fastapi import APIRouter

from zzz_tracker.web.deps import RequiredStaticDataDep
from zzz_tracker.web.schemas import (
    CatalogAgentRead,
    CatalogDiscSetRead,
    CatalogListResponse,
    CatalogPropertyRead,
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


def _catalog[KeyT, InfoT, ReadT](
    ids: Callable[[], Iterable[KeyT]],
    lookup: Callable[[KeyT], InfoT | None],
    build: Callable[[InfoT], ReadT | None],
) -> CatalogListResponse[ReadT]:
    """List every id whose info is known and whose entry the builder accepts."""
    items: list[ReadT] = []
    for key in ids():
        info = lookup(key)
        if info is None:
            continue
        item = build(info)
        if item is None:
            continue
        items.append(item)
    return CatalogListResponse(items=items)


@router.get("/agents", response_model=CatalogListResponse[CatalogAgentRead])
def list_agents(static: RequiredStaticDataDep) -> CatalogListResponse[CatalogAgentRead]:
    """Every agent the game knows about, for pickers and for rendering unknown ids."""
    return _catalog(
        static.agent_ids,
        static.agent,
        lambda info: CatalogAgentRead(
            game_id=info.game_id,
            name=info.name,
            rarity=info.rarity,
            profession=info.profession,
            elements=list(info.elements),
            image_url=info.image_url,
            icon_url=info.circle_icon_url,
        ),
    )


@router.get("/wengines", response_model=CatalogListResponse[CatalogWEngineRead])
def list_wengines(static: RequiredStaticDataDep) -> CatalogListResponse[CatalogWEngineRead]:
    return _catalog(
        static.wengine_ids,
        static.wengine,
        lambda info: CatalogWEngineRead(
            game_id=info.game_id,
            name=info.name,
            rarity=info.rarity,
            profession=info.profession,
            image_url=info.image_url,
        ),
    )


@router.get("/discs", response_model=CatalogListResponse[CatalogDiscSetRead])
def list_disc_sets(static: RequiredStaticDataDep) -> CatalogListResponse[CatalogDiscSetRead]:
    return _catalog(
        static.disc_set_ids,
        static.disc_set,
        lambda info: CatalogDiscSetRead(
            set_id=info.set_id,
            name=info.name,
            icon_url=info.icon_url,
            bonus_props=dict(info.set_bonus),
        ),
    )


@router.get("/properties", response_model=CatalogListResponse[CatalogPropertyRead])
def list_properties(static: RequiredStaticDataDep) -> CatalogListResponse[CatalogPropertyRead]:
    """Stat properties that can be named; ids Enka leaves unnamed are left out."""
    return _catalog(
        static.property_ids,
        static.property,
        lambda info: (
            CatalogPropertyRead(prop_id=info.property_id, name=info.name, format=info.format)
            if info.name
            else None
        ),
    )
