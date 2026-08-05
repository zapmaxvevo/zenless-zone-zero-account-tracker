from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

CATALOG_PATHS = (
    "/catalog/agents",
    "/catalog/wengines",
    "/catalog/discs",
    "/catalog/properties",
)


def catalog(client: TestClient, path: str) -> list[dict[str, Any]]:
    response = client.get(path)
    assert response.status_code == 200
    items: list[dict[str, Any]] = response.json()["items"]
    return items


def test_the_agent_catalog_names_every_agent_the_game_knows(client: TestClient) -> None:
    items = catalog(client, "/catalog/agents")

    assert [item["game_id"] for item in items] == [1041, 1191]
    assert items[0] == {
        "game_id": 1041,
        "name": "Soldier 11",
        "rarity": 4,
        "profession": "Attack",
        "elements": ["Fire"],
        "image_url": "https://enka.network/ui/zzz/IconRole05.png",
        "icon_url": "https://enka.network/ui/zzz/IconRoleCircle05.png",
    }


def test_the_wengine_catalog_names_every_wengine_with_its_rarity(client: TestClient) -> None:
    items = catalog(client, "/catalog/wengines")

    assert [item["game_id"] for item in items] == [14104, 14121]
    assert items[0] == {
        "game_id": 14104,
        "name": "The Brimstone",
        "rarity": 4,
        "profession": "Attack",
        "image_url": "https://enka.network/ui/zzz/Weapon_S_1041.png",
    }
    assert items[1]["name"] == "Weeping Cradle"


def test_the_disc_catalog_lists_the_sets_with_the_bonus_they_grant(client: TestClient) -> None:
    items = catalog(client, "/catalog/discs")

    assert [item["set_id"] for item in items] == [31000, 32800]
    assert items[0] == {
        "set_id": 31000,
        "name": "Woodpecker Electro",
        "icon_url": "https://enka.network/ui/zzz/SuitWoodpeckerElectro.png",
        "bonus_props": {"20103": 800},
    }


def test_the_property_catalog_gives_each_stat_a_name_and_a_display_format(
    client: TestClient,
) -> None:
    items = catalog(client, "/catalog/properties")
    by_id = {item["prop_id"]: item for item in items}

    assert by_id[20103] == {"prop_id": 20103, "name": "CRIT Rate", "format": "{0:0.#%}"}
    assert by_id[11103]["name"] == "HP"
    assert by_id[12102]["format"] == "{0:0.#%}"


@pytest.mark.parametrize("path", CATALOG_PATHS)
def test_without_downloaded_static_data_the_catalog_says_the_service_is_unavailable(
    client_without_static_data: TestClient, path: str
) -> None:
    response = client_without_static_data.get(path)

    assert response.status_code == 503
    assert "sync-static" in response.json()["detail"]
