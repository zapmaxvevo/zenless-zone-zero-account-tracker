from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from zzz_tracker.storage.models import SOURCE_MANUAL, Account, Agent

from .conftest import TRACKED_UID, UNKNOWN_UID, owned_account

OTHER_UID = "1300000002"


def claimed_account_roster(client: TestClient) -> list[int]:
    """Claim the recorded account and return the ids of its agents, in roster order."""
    owned_account(client)
    roster = client.get(f"/accounts/{TRACKED_UID}/agents").json()["items"]
    return [item["id"] for item in roster]


def agent_of_another_account(session: Session) -> int:
    session.add(Account(uid=OTHER_UID, nickname="Belle"))
    stranger = Agent(account_uid=OTHER_UID, game_id=1211, source=SOURCE_MANUAL)
    session.add(stranger)
    session.commit()
    return stranger.id


def comp(*members: tuple[int, int], name: str = "Fire team", notes: str = "") -> dict[str, Any]:
    return {
        "name": name,
        "notes": notes,
        "members": [{"slot": slot, "agent_id": agent_id} for slot, agent_id in members],
    }


def test_a_saved_comp_comes_back_with_its_agents_already_resolved(client: TestClient) -> None:
    # Given
    soldier_id, ellen_id = claimed_account_roster(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/teams",
        json=comp((1, soldier_id), (2, ellen_id), name="Burn", notes="anomaly bait"),
    )

    # Then
    assert response.status_code == 201
    team = response.json()
    assert team["account_uid"] == TRACKED_UID
    assert team["name"] == "Burn"
    assert team["notes"] == "anomaly bait"
    assert team["created_at"] is not None
    assert [member["slot"] for member in team["members"]] == [1, 2]
    first = team["members"][0]["agent"]
    assert first["id"] == soldier_id
    assert first["name"] == "Soldier 11"
    assert first["icon_url"] == "https://enka.network/ui/zzz/IconRoleCircle05.png"
    assert first["wengine"]["name"] == "The Brimstone"

    listing = client.get(f"/accounts/{TRACKED_UID}/teams")
    assert [item["id"] for item in listing.json()["items"]] == [team["id"]]

    detail = client.get(f"/teams/{team['id']}")
    assert detail.status_code == 200
    assert detail.json() == team


def test_editing_a_comp_replaces_its_name_notes_and_every_member(client: TestClient) -> None:
    # Given
    soldier_id, ellen_id = claimed_account_roster(client)
    team_id = client.post(
        f"/accounts/{TRACKED_UID}/teams", json=comp((1, soldier_id), (2, ellen_id))
    ).json()["id"]

    # When
    response = client.put(
        f"/teams/{team_id}",
        json=comp((3, ellen_id), name="Ice mono", notes="swap"),
    )

    # Then
    assert response.status_code == 200
    team = response.json()
    assert team["id"] == team_id
    assert team["name"] == "Ice mono"
    assert team["notes"] == "swap"
    assert [(member["slot"], member["agent"]["id"]) for member in team["members"]] == [
        (3, ellen_id)
    ]
    assert client.get(f"/teams/{team_id}").json()["members"] == team["members"]


def test_deleting_a_comp_leaves_the_agents_it_grouped_tracked(client: TestClient) -> None:
    # Given
    soldier_id, _ = claimed_account_roster(client)
    team_id = client.post(f"/accounts/{TRACKED_UID}/teams", json=comp((1, soldier_id))).json()["id"]

    # When
    response = client.delete(f"/teams/{team_id}")

    # Then
    assert response.status_code == 204
    assert client.get(f"/teams/{team_id}").status_code == 404
    assert client.get(f"/accounts/{TRACKED_UID}/teams").json()["items"] == []
    assert client.get(f"/agents/{soldier_id}").status_code == 200


def test_two_members_cannot_share_a_slot(client: TestClient) -> None:
    # Given
    soldier_id, ellen_id = claimed_account_roster(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/teams", json=comp((1, soldier_id), (1, ellen_id))
    )

    # Then
    assert response.status_code == 422
    assert "slot" in response.json()["detail"]
    assert client.get(f"/accounts/{TRACKED_UID}/teams").json()["items"] == []


def test_the_same_agent_cannot_take_two_slots_of_a_comp(client: TestClient) -> None:
    # Given
    soldier_id, _ = claimed_account_roster(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/teams", json=comp((1, soldier_id), (2, soldier_id))
    )

    # Then
    assert response.status_code == 422
    assert "more than one slot" in response.json()["detail"]
    assert client.get(f"/accounts/{TRACKED_UID}/teams").json()["items"] == []


def test_a_comp_cannot_borrow_an_agent_from_another_account(
    client: TestClient, session: Session
) -> None:
    # Given
    soldier_id, _ = claimed_account_roster(client)
    stranger_id = agent_of_another_account(session)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/teams", json=comp((1, soldier_id), (2, stranger_id))
    )

    # Then
    assert response.status_code == 422
    assert TRACKED_UID in response.json()["detail"]


def test_a_comp_with_an_agent_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    # Given
    claimed_account_roster(client)

    # When
    response = client.post(f"/accounts/{TRACKED_UID}/teams", json=comp((1, 4242)))

    # Then
    assert response.status_code == 404
    assert "4242" in response.json()["detail"]


def test_a_comp_holds_at_most_three_agents(client: TestClient, session: Session) -> None:
    # Given
    soldier_id, ellen_id = claimed_account_roster(client)
    extras = [
        Agent(account_uid=TRACKED_UID, game_id=game_id, source=SOURCE_MANUAL)
        for game_id in (1211, 1221)
    ]
    session.add_all(extras)
    session.commit()

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/teams",
        json={
            "name": "Too many",
            "members": [
                {"slot": 1, "agent_id": soldier_id},
                {"slot": 2, "agent_id": ellen_id},
                {"slot": 3, "agent_id": extras[0].id},
                {"slot": 4, "agent_id": extras[1].id},
            ],
        },
    )

    # Then
    assert response.status_code == 422


def test_a_comp_needs_at_least_one_agent(client: TestClient) -> None:
    # Given
    claimed_account_roster(client)

    # When
    response = client.post(f"/accounts/{TRACKED_UID}/teams", json={"name": "Empty", "members": []})

    # Then
    assert response.status_code == 422


def test_saving_a_comp_for_an_account_that_is_not_tracked_answers_not_found(
    client: TestClient,
) -> None:
    response = client.post(f"/accounts/{UNKNOWN_UID}/teams", json=comp((1, 1)))

    assert response.status_code == 404
    assert UNKNOWN_UID in response.json()["detail"]


def test_listing_the_comps_of_an_account_that_is_not_tracked_answers_not_found(
    client: TestClient,
) -> None:
    response = client.get(f"/accounts/{UNKNOWN_UID}/teams")

    assert response.status_code == 404


def test_reading_editing_or_deleting_a_comp_that_does_not_exist_answers_not_found(
    client: TestClient,
) -> None:
    # Given
    soldier_id, _ = claimed_account_roster(client)

    # Then
    assert client.get("/teams/77").status_code == 404
    assert client.put("/teams/77", json=comp((1, soldier_id))).status_code == 404
    assert client.delete("/teams/77").status_code == 404
