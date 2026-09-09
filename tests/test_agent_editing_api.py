from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from .conftest import TRACKED_UID, UNKNOWN_UID, FakeEnkaNetwork, track_account

SOLDIER_11 = 1041
ELLEN = 1191
BURNICE = 1211

WEEPING_CRADLE = 14121
WOODPECKER_PIECE = 31041
ASTRAL_PIECE = 32845


def agent_id_of(client: TestClient, game_id: int, uid: str = TRACKED_UID) -> int:
    roster = client.get(f"/accounts/{uid}/agents").json()["items"]
    entry = next(item for item in roster if item["game_id"] == game_id)
    return int(entry["id"])


def disc(slot: int, game_id: int = WOODPECKER_PIECE, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "slot": slot,
        "game_id": game_id,
        "level": 15,
        "roll_count": 5,
        "main_stat_id": 11103,
        # Bases, the same scale Enka uses: 550 reads 2200 at level 15, and each CRIT Rate roll
        # is 2.4%. The write contract never takes the value shown in game.
        "main_stat_value": 550,
        "substats": [{"prop_id": 20103, "value": 240, "rolls": 3}],
    }
    payload.update(overrides)
    return payload


def hand_written_build() -> dict[str, Any]:
    return {
        "game_id": BURNICE,
        "level": 50,
        "promotion_level": 4,
        "mindscape_level": 1,
        "core_skill_enhancement": 3,
        "skill_levels": {"0": 9, "1": 7},
        "wengine": {
            "game_id": WEEPING_CRADLE,
            "level": 50,
            "modification_level": 4,
            "phase": 3,
        },
        "discs": [disc(1), disc(2), disc(3, game_id=ASTRAL_PIECE)],
    }


def test_an_agent_typed_in_by_hand_is_stored_with_its_whole_build(client: TestClient) -> None:
    # Given
    track_account(client)

    # When
    response = client.post(f"/accounts/{TRACKED_UID}/agents", json=hand_written_build())

    # Then
    assert response.status_code == 201
    agent = response.json()
    assert agent["account_uid"] == TRACKED_UID
    assert agent["game_id"] == BURNICE
    assert agent["source"] == "manual"
    assert agent["level"] == 50
    assert agent["promotion_level"] == 4
    assert agent["mindscape_level"] == 1
    assert agent["core_skill_enhancement"] == 3
    assert agent["skill_levels"] == {"0": 9, "1": 7}
    assert agent["wengine"]["name"] == "Weeping Cradle"
    assert agent["wengine"]["phase"] == 3
    assert [item["slot"] for item in agent["discs"]] == [1, 2, 3]
    assert agent["discs"][0]["main_stat"] == {
        "prop_id": 11103,
        "name": "HP",
        "format": "{0:0}",
        "value": 550,
        "rolls": 0,
        "total": 2200,
    }
    assert agent["equipped_sets"] == [
        {
            "set_id": 31000,
            "name": "Woodpecker Electro",
            "icon_url": "https://enka.network/ui/zzz/SuitWoodpeckerElectro.png",
            "pieces": 2,
            "bonus_props": {"20103": 800},
        },
        {
            "set_id": 32800,
            "name": "Astral Voice",
            "icon_url": "https://enka.network/ui/zzz/SuitAstralVoice.png",
            "pieces": 1,
            "bonus_props": {"12102": 1000},
        },
    ]

    roster = client.get(f"/accounts/{TRACKED_UID}/agents").json()["items"]
    assert [item["game_id"] for item in roster] == [SOLDIER_11, ELLEN, BURNICE]


def test_a_disc_typed_without_its_set_takes_the_one_the_static_data_knows(
    client: TestClient,
) -> None:
    # Given
    track_account(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/agents",
        json={"game_id": BURNICE, "discs": [disc(4, game_id=ASTRAL_PIECE)]},
    )

    # Then
    stored = response.json()["discs"][0]
    assert stored["set_id"] == 32800
    assert stored["set_name"] == "Astral Voice"
    assert stored["rarity"] == 4


def test_adding_an_agent_the_account_already_tracks_answers_conflict(client: TestClient) -> None:
    # Given
    track_account(client)

    # When
    response = client.post(f"/accounts/{TRACKED_UID}/agents", json={"game_id": SOLDIER_11})

    # Then
    assert response.status_code == 409
    assert str(SOLDIER_11) in response.json()["detail"]


def test_two_discs_cannot_share_a_slot(client: TestClient) -> None:
    # Given
    track_account(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/agents",
        json={"game_id": BURNICE, "discs": [disc(1), disc(1, game_id=ASTRAL_PIECE)]},
    )

    # Then
    assert response.status_code == 422
    assert "slot" in response.json()["detail"]
    roster = client.get(f"/accounts/{TRACKED_UID}/agents").json()["items"]
    assert [item["game_id"] for item in roster] == [SOLDIER_11, ELLEN]


def test_adding_an_agent_to_an_account_that_is_not_tracked_answers_not_found(
    client: TestClient,
) -> None:
    response = client.post(f"/accounts/{UNKNOWN_UID}/agents", json={"game_id": BURNICE})

    assert response.status_code == 404
    assert UNKNOWN_UID in response.json()["detail"]


def test_a_level_out_of_the_game_range_is_rejected(client: TestClient) -> None:
    # Given
    track_account(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/agents", json={"game_id": BURNICE, "level": 999}
    )

    # Then
    assert response.status_code == 422


def test_correcting_an_imported_agent_makes_it_manual_and_the_next_sync_leaves_it_alone(
    client: TestClient, enka: FakeEnkaNetwork
) -> None:
    # Given
    track_account(client)
    soldier_id = agent_id_of(client, SOLDIER_11)

    # When
    patched = client.patch(f"/agents/{soldier_id}", json={"level": 12, "mindscape_level": 6})
    client.post(f"/accounts/{TRACKED_UID}/sync", params={"force": True})

    # Then
    assert patched.status_code == 200
    assert patched.json()["source"] == "manual"
    assert patched.json()["level"] == 12
    assert patched.json()["mindscape_level"] == 6
    assert enka.times_queried(TRACKED_UID) == 2

    soldier = client.get(f"/agents/{soldier_id}").json()
    assert soldier["level"] == 12
    assert soldier["mindscape_level"] == 6
    assert soldier["source"] == "manual"

    ellen = client.get(f"/agents/{agent_id_of(client, ELLEN)}").json()
    assert ellen["source"] == "enka"
    assert ellen["level"] == 50


def test_patching_the_discs_replaces_the_whole_set(client: TestClient) -> None:
    # Given
    track_account(client)
    soldier_id = agent_id_of(client, SOLDIER_11)
    assert len(client.get(f"/agents/{soldier_id}").json()["discs"]) == 6

    # When
    response = client.patch(
        f"/agents/{soldier_id}",
        json={"discs": [disc(2, game_id=ASTRAL_PIECE, level=9, main_stat_value=1500)]},
    )

    # Then
    assert response.status_code == 200
    discs = response.json()["discs"]
    assert [item["slot"] for item in discs] == [2]
    assert discs[0]["game_id"] == ASTRAL_PIECE
    assert discs[0]["set_name"] == "Astral Voice"
    assert discs[0]["level"] == 9
    assert discs[0]["main_stat"]["value"] == 1500
    assert client.get(f"/agents/{soldier_id}").json()["discs"] == discs


def test_patching_the_wengine_swaps_it_and_sending_null_unequips_it(client: TestClient) -> None:
    # Given
    track_account(client)
    soldier_id = agent_id_of(client, SOLDIER_11)

    # When
    swapped = client.patch(
        f"/agents/{soldier_id}",
        json={"wengine": {"game_id": WEEPING_CRADLE, "level": 30, "phase": 2}},
    )
    unequipped = client.patch(f"/agents/{soldier_id}", json={"wengine": None})

    # Then
    assert swapped.json()["wengine"] == {
        "game_id": WEEPING_CRADLE,
        "name": "Weeping Cradle",
        "icon_url": "https://enka.network/ui/zzz/Weapon_S_1211.png",
        "rarity": 4,
        "level": 30,
        "modification_level": 0,
        "phase": 2,
    }
    assert unequipped.json()["wengine"] is None
    assert client.get(f"/agents/{soldier_id}").json()["wengine"] is None


def test_a_patch_that_says_nothing_keeps_the_build_but_still_claims_the_agent(
    client: TestClient,
) -> None:
    # Given
    track_account(client)
    soldier_id = agent_id_of(client, SOLDIER_11)

    # When
    response = client.patch(f"/agents/{soldier_id}", json={})

    # Then
    agent = response.json()
    assert agent["source"] == "manual"
    assert agent["level"] == 60
    assert agent["wengine"]["game_id"] == 14104
    assert [item["slot"] for item in agent["discs"]] == [1, 2, 3, 4, 5, 6]


def test_patching_an_agent_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    response = client.patch("/agents/4242", json={"level": 10})

    assert response.status_code == 404
    assert "4242" in response.json()["detail"]


def test_deleting_an_agent_drops_its_slot_and_leaves_the_rest_of_the_comp_standing(
    client: TestClient,
) -> None:
    # Given
    track_account(client)
    soldier_id = agent_id_of(client, SOLDIER_11)
    ellen_id = agent_id_of(client, ELLEN)
    team_id = client.post(
        f"/accounts/{TRACKED_UID}/teams",
        json={
            "name": "Burn",
            "members": [
                {"slot": 1, "agent_id": soldier_id},
                {"slot": 2, "agent_id": ellen_id},
            ],
        },
    ).json()["id"]

    # When
    response = client.delete(f"/agents/{soldier_id}")

    # Then
    assert response.status_code == 204
    assert client.get(f"/agents/{soldier_id}").status_code == 404
    team = client.get(f"/teams/{team_id}").json()
    assert [(member["slot"], member["agent"]["id"]) for member in team["members"]] == [
        (2, ellen_id)
    ]
    roster = client.get(f"/accounts/{TRACKED_UID}/agents").json()["items"]
    assert [item["game_id"] for item in roster] == [ELLEN]


def test_deleting_an_agent_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    response = client.delete("/agents/4242")

    assert response.status_code == 404
