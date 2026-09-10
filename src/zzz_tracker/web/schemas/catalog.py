from __future__ import annotations

from pydantic import BaseModel


class CatalogAgentRead(BaseModel):
    """One entry of the agent catalog, already resolved to the server's language."""

    game_id: int
    name: str
    rarity: int | None
    profession: str | None
    elements: list[str]
    image_url: str | None
    icon_url: str | None


class CatalogWEngineRead(BaseModel):
    game_id: int
    name: str
    rarity: int | None
    profession: str | None
    image_url: str | None


class CatalogDiscSetRead(BaseModel):
    set_id: int
    name: str
    icon_url: str | None
    bonus_props: dict[str, int]


class CatalogPropertyRead(BaseModel):
    prop_id: int
    name: str
    format: str


class CatalogListResponse[ReadT](BaseModel):
    """Never empty: without downloaded static data the catalog answers 503, not `[]`."""

    items: list[ReadT]
