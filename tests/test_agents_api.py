from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from zzz_tracker.storage.models import SOURCE_MANUAL, Agent

from .conftest import TRACKED_UID, UNKNOWN_UID

SOLDIER_11 = 1041
ELLEN = 1191


def roster_of(client: TestClient, uid: str = TRACKED_UID) -> list[dict[str, Any]]:
    response = client.get(f"/accounts/{uid}/agents")
    assert response.status_code == 200
    items: list[dict[str, Any]] = response.json()["items"]
    return items


def entry_for(roster: list[dict[str, Any]], game_id: int) -> dict[str, Any]:
    return next(item for item in roster if item["game_id"] == game_id)


def test_the_roster_shows_every_imported_agent_with_names_icons_and_its_wengine(
    client: TestClient,
) -> None:
    # Given
    client.post("/accounts", json={"uid": TRACKED_UID})

    # When
    roster = roster_of(client)

    # Then
    assert [item["game_id"] for item in roster] == [SOLDIER_11, ELLEN]

    soldier = entry_for(roster, SOLDIER_11)
    assert soldier["name"] == "Soldier 11"
    assert soldier["rarity"] == 4
    assert soldier["elements"] == ["Fire"]
    assert soldier["profession"] == "Attack"
    assert soldier["icon_url"] == "https://enka.network/ui/zzz/IconRoleCircle05.png"
    assert soldier["account_uid"] == TRACKED_UID
    assert soldier["level"] == 60
    assert soldier["promotion_level"] == 5
    assert soldier["mindscape_level"] == 3
    assert soldier["core_skill_enhancement"] == 6
    assert soldier["source"] == "enka"
    assert soldier["disc_count"] == 6
    assert soldier["wengine"] == {
        "game_id": 14104,
        "name": "The Brimstone",
        "icon_url": "https://enka.network/ui/zzz/Weapon_S_1041.png",
        "rarity": 4,
        "level": 60,
        "modification_level": 5,
        "phase": 1,
    }


def test_an_agent_without_discs_still_shows_up_in_the_roster(client: TestClient) -> None:
    # Given
    client.post("/accounts", json={"uid": TRACKED_UID})

    # When
    ellen = entry_for(roster_of(client), ELLEN)

    # Then
    assert ellen["name"] == "Ellen"
    assert ellen["disc_count"] == 0
    assert ellen["wengine"] is not None
    assert ellen["wengine"]["name"] == "Weeping Cradle"


def test_an_agent_added_by_hand_is_listed_next_to_the_imported_ones(
    client: TestClient, session: Session
) -> None:
    # Given
    client.post("/accounts", json={"uid": TRACKED_UID})
    session.add(Agent(account_uid=TRACKED_UID, game_id=1211, level=40, source=SOURCE_MANUAL))
    session.commit()

    # When
    roster = roster_of(client)

    # Then
    assert [item["game_id"] for item in roster] == [SOLDIER_11, ELLEN, 1211]
    by_hand = entry_for(roster, 1211)
    assert by_hand["source"] == "manual"
    assert by_hand["level"] == 40
    assert by_hand["wengine"] is None
    assert by_hand["disc_count"] == 0


def test_an_id_the_static_data_does_not_know_is_served_without_a_name(
    client: TestClient, session: Session
) -> None:
    # Given
    client.post("/accounts", json={"uid": TRACKED_UID})
    session.add(Agent(account_uid=TRACKED_UID, game_id=999999, source=SOURCE_MANUAL))
    session.commit()

    # When
    unknown = entry_for(roster_of(client), 999999)

    # Then
    assert unknown["name"] is None
    assert unknown["icon_url"] is None
    assert unknown["rarity"] is None
    assert unknown["elements"] == []


def test_asking_for_the_roster_of_an_account_that_is_not_tracked_answers_not_found(
    client: TestClient,
) -> None:
    response = client.get(f"/accounts/{UNKNOWN_UID}/agents")

    assert response.status_code == 404
    assert UNKNOWN_UID in response.json()["detail"]


def test_the_detail_of_an_agent_resolves_its_whole_build(client: TestClient) -> None:
    # Given
    client.post("/accounts", json={"uid": TRACKED_UID})
    agent_id = entry_for(roster_of(client), SOLDIER_11)["id"]

    # When
    response = client.get(f"/agents/{agent_id}")

    # Then
    assert response.status_code == 200
    build = response.json()
    assert build["name"] == "Soldier 11"
    assert build["image_url"] == "https://enka.network/ui/zzz/IconRole05.png"
    assert build["skill_levels"] == {"0": 12, "1": 12, "2": 10, "3": 12, "5": 7, "6": 9}
    assert build["weapon_effect_state"] == 2
    assert build["obtained_at"] is not None
    assert build["wengine"]["name"] == "The Brimstone"

    assert [disc["slot"] for disc in build["discs"]] == [1, 2, 3, 4, 5, 6]
    first = build["discs"][0]
    assert first["game_id"] == 31041
    assert first["set_id"] == 31000
    assert first["set_name"] == "Woodpecker Electro"
    assert first["set_icon_url"] == "https://enka.network/ui/zzz/SuitWoodpeckerElectro.png"
    assert first["rarity"] == 4
    assert first["level"] == 15
    assert first["roll_count"] == 5
    # `value` is Enka's base and `total` what the game shows: a 550 main stat on an S disc at
    # level 15 reads 2200, and three rolls of 2.4% CRIT Rate read 7.2%.
    assert first["main_stat"] == {
        "prop_id": 11103,
        "name": "HP",
        "format": "{0:0}",
        "value": 550,
        "rolls": 0,
        "total": 2200,
    }
    assert first["substats"][0] == {
        "prop_id": 20103,
        "name": "CRIT Rate",
        "format": "{0:0.#%}",
        "value": 240,
        "rolls": 3,
        "total": 720,
    }

    assert build["equipped_sets"] == [
        {
            "set_id": 31000,
            "name": "Woodpecker Electro",
            "icon_url": "https://enka.network/ui/zzz/SuitWoodpeckerElectro.png",
            "pieces": 4,
            "bonus_props": {"20103": 800},
        },
        {
            "set_id": 32800,
            "name": "Astral Voice",
            "icon_url": "https://enka.network/ui/zzz/SuitAstralVoice.png",
            "pieces": 2,
            "bonus_props": {"12102": 1000},
        },
    ]


def test_asking_for_an_agent_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    response = client.get("/agents/4242")

    assert response.status_code == 404
    assert "4242" in response.json()["detail"]


def test_without_the_static_data_the_roster_and_the_build_still_answer_with_raw_ids(
    client_without_static_data: TestClient,
) -> None:
    # Given
    client = client_without_static_data
    client.post("/accounts", json={"uid": TRACKED_UID})

    # When
    roster = roster_of(client)
    soldier = entry_for(roster, SOLDIER_11)
    build = client.get(f"/agents/{soldier['id']}").json()

    # Then
    assert soldier["name"] is None
    assert soldier["icon_url"] is None
    assert soldier["level"] == 60
    assert soldier["wengine"] == {
        "game_id": 14104,
        "name": None,
        "icon_url": None,
        "rarity": None,
        "level": 60,
        "modification_level": 5,
        "phase": 1,
    }
    assert build["discs"][0]["game_id"] == 31041
    assert build["discs"][0]["set_name"] is None
    # Without the static data the disc has no known rarity, so the main stat cannot be scaled:
    # better an absent total than the level-0 base passed off as the value the game shows.
    assert build["discs"][0]["main_stat"] == {
        "prop_id": 11103,
        "name": None,
        "format": None,
        "value": 550,
        "rolls": 0,
        "total": None,
    }
    assert build["equipped_sets"] == []
