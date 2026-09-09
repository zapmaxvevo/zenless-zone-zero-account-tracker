"""Who is allowed to write a tracked account.

Reading is public and stays public. Writing takes the key of the account being written, so
these tests are about one question asked in several shapes: does this caller hold the key of
*this* account? The interesting cases are the ones where the answer is "a valid key, but of
somebody else's account" — agent and team ids are global, so a key is never a passport.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from zzz_tracker.storage.models import (
    CLAIM_PROVISIONAL,
    CLAIM_UNCLAIMED,
    SOURCE_MANUAL,
    Account,
    Agent,
)

from .conftest import TRACKED_UID, account_key_of, key_headers, track_account

OTHER_UID = "1300000002"
BURNICE = 1221
WRONG_KEY = "zzk_not-the-key-that-owns-anything"


def untracked_account(session: Session, uid: str = OTHER_UID) -> None:
    """An account the way the migration leaves the old ones: tracked, owned by nobody."""
    session.add(Account(uid=uid, nickname="Belle"))
    session.commit()


def agent_of(session: Session, uid: str, game_id: int = 1211) -> int:
    agent = Agent(account_uid=uid, game_id=game_id, source=SOURCE_MANUAL)
    session.add(agent)
    session.commit()
    return agent.id


def claim(client: TestClient, uid: str) -> str:
    return account_key_of(client.post(f"/accounts/{uid}/claim"))


def first_agent_of(client: TestClient, uid: str = TRACKED_UID) -> int:
    roster = client.get(f"/accounts/{uid}/agents").json()["items"]
    return int(roster[0]["id"])


def first_agent_game_id(client: TestClient, uid: str = TRACKED_UID) -> int:
    roster = client.get(f"/accounts/{uid}/agents").json()["items"]
    return int(roster[0]["game_id"])


def comp(agent_id: int, name: str = "Fire team") -> dict[str, Any]:
    return {"name": name, "notes": "", "members": [{"slot": 1, "agent_id": agent_id}]}


def test_tracking_a_uid_nobody_owns_hands_out_the_key_that_writes_it(
    client: TestClient,
) -> None:
    # Given / When
    response = track_account(client)

    # Then
    assert response.status_code == 201
    body = response.json()
    assert body["account_key"].startswith("zzk_")
    assert body["claim_level"] == CLAIM_PROVISIONAL
    assert client.get(f"/accounts/{TRACKED_UID}").json()["claim_level"] == CLAIM_PROVISIONAL


def test_the_key_is_never_readable_again_after_the_response_that_issued_it(
    client: TestClient,
) -> None:
    # Given
    account_key = account_key_of(track_account(client))

    # When
    account = client.get(f"/accounts/{TRACKED_UID}").json()

    # Then
    assert "account_key" not in account
    assert account_key not in client.get(f"/accounts/{TRACKED_UID}").text


def test_an_account_tracked_before_keys_existed_reads_as_unclaimed(
    client: TestClient, session: Session
) -> None:
    # Given
    untracked_account(session)

    # When
    account = client.get(f"/accounts/{OTHER_UID}").json()

    # Then
    assert account["claim_level"] == CLAIM_UNCLAIMED


def test_claiming_an_account_nobody_owns_hands_out_its_key(
    client: TestClient, session: Session
) -> None:
    # Given
    untracked_account(session)

    # When
    response = client.post(f"/accounts/{OTHER_UID}/claim")

    # Then
    assert response.status_code == 201
    body = response.json()
    assert body["uid"] == OTHER_UID
    assert body["account_key"].startswith("zzk_")
    assert body["claim_level"] == CLAIM_PROVISIONAL


def test_claiming_an_account_that_already_has_an_owner_is_a_conflict(
    client: TestClient,
) -> None:
    # Given
    track_account(client)

    # When
    response = client.post(f"/accounts/{TRACKED_UID}/claim")

    # Then
    assert response.status_code == 409
    assert TRACKED_UID in response.json()["detail"]


def test_claiming_an_account_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    # Given / When
    response = client.post(f"/accounts/{OTHER_UID}/claim")

    # Then
    assert response.status_code == 404


def test_tracking_a_uid_that_already_has_an_owner_refreshes_it_without_a_new_key(
    client: TestClient,
) -> None:
    # Given
    first = account_key_of(track_account(client))

    # When
    again = client.post("/accounts", json={"uid": TRACKED_UID})

    # Then
    assert again.status_code == 201
    assert again.json()["account_key"] is None
    assert (
        client.post(
            f"/accounts/{TRACKED_UID}/agents",
            json={"game_id": BURNICE},
            headers=key_headers(first),
        ).status_code
        == 201
    )


def test_writing_an_account_without_the_key_is_forbidden(client: TestClient) -> None:
    # Given
    track_account(client)
    del client.headers["X-Account-Key"]

    # When
    response = client.post(f"/accounts/{TRACKED_UID}/agents", json={"game_id": BURNICE})

    # Then
    assert response.status_code == 403
    assert TRACKED_UID in response.json()["detail"]
    assert client.get(f"/accounts/{TRACKED_UID}/agents").json()["items"]


def test_writing_an_account_with_a_key_that_is_not_its_own_is_forbidden(
    client: TestClient,
) -> None:
    # Given
    track_account(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/agents",
        json={"game_id": BURNICE},
        headers=key_headers(WRONG_KEY),
    )

    # Then
    assert response.status_code == 403


def test_writing_an_account_with_its_own_key_goes_through(client: TestClient) -> None:
    # Given
    account_key = account_key_of(track_account(client))

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/agents",
        json={"game_id": BURNICE},
        headers=key_headers(account_key),
    )

    # Then
    assert response.status_code == 201
    assert response.json()["game_id"] == BURNICE


def test_writing_an_account_nobody_claimed_asks_for_it_to_be_claimed_first(
    client: TestClient, session: Session
) -> None:
    # Given
    untracked_account(session)

    # When
    response = client.post(f"/accounts/{OTHER_UID}/agents", json={"game_id": BURNICE})

    # Then
    assert response.status_code == 409
    assert "claim" in response.json()["detail"]
    assert client.get(f"/accounts/{OTHER_UID}/agents").json()["items"] == []


def test_editing_an_agent_is_settled_by_the_account_that_owns_it_and_not_by_the_url(
    client: TestClient,
) -> None:
    """`PATCH /agents/{id}` names no account, so the row is what says which key to ask for."""
    # Given
    account_key = account_key_of(track_account(client))
    agent_id = first_agent_of(client)
    del client.headers["X-Account-Key"]

    # When
    without_key = client.patch(f"/agents/{agent_id}", json={"level": 12})
    with_key = client.patch(
        f"/agents/{agent_id}", json={"level": 12}, headers=key_headers(account_key)
    )

    # Then
    assert without_key.status_code == 403
    assert with_key.status_code == 200
    assert with_key.json()["level"] == 12


def test_a_key_of_another_account_can_neither_edit_nor_delete_an_agent(
    client: TestClient, session: Session
) -> None:
    """A perfectly valid key, of the wrong account: claiming an empty UID is free."""
    # Given
    track_account(client)
    agent_id = first_agent_of(client)
    untracked_account(session)
    stranger_key = claim(client, OTHER_UID)

    # When
    edited = client.patch(
        f"/agents/{agent_id}", json={"level": 42}, headers=key_headers(stranger_key)
    )
    deleted = client.delete(f"/agents/{agent_id}", headers=key_headers(stranger_key))

    # Then
    assert edited.status_code == 403
    assert deleted.status_code == 403
    assert client.get(f"/agents/{agent_id}").json()["level"] != 42


def test_a_key_of_another_account_can_neither_rewrite_nor_delete_a_team(
    client: TestClient, session: Session
) -> None:
    # Given
    account_key = account_key_of(track_account(client))
    agent_id = first_agent_of(client)
    team_id = client.post(
        f"/accounts/{TRACKED_UID}/teams",
        json=comp(agent_id),
        headers=key_headers(account_key),
    ).json()["id"]
    untracked_account(session)
    stranger_key = claim(client, OTHER_UID)

    # When
    rewritten = client.put(
        f"/teams/{team_id}",
        json=comp(agent_id, name="Stolen"),
        headers=key_headers(stranger_key),
    )
    deleted = client.delete(f"/teams/{team_id}", headers=key_headers(stranger_key))

    # Then
    assert rewritten.status_code == 403
    assert deleted.status_code == 403
    assert client.get(f"/teams/{team_id}").json()["name"] == "Fire team"


def test_a_team_of_a_claimed_account_is_written_with_the_key_of_that_account(
    client: TestClient, session: Session
) -> None:
    # Given
    untracked_account(session)
    stranger_key = claim(client, OTHER_UID)
    stranger_agent = agent_of(session, OTHER_UID)

    # When
    created = client.post(
        f"/accounts/{OTHER_UID}/teams",
        json=comp(stranger_agent),
        headers=key_headers(stranger_key),
    )
    deleted = client.delete(f"/teams/{created.json()['id']}", headers=key_headers(stranger_key))

    # Then
    assert created.status_code == 201
    assert deleted.status_code == 204
    assert client.get(f"/accounts/{OTHER_UID}/teams").json()["items"] == []


def test_a_malformed_uid_is_still_refused_by_the_path_before_any_key_is_asked_for(
    client: TestClient,
) -> None:
    """The guard reads the same path parameter as the route and must not loosen it."""
    # Given / When
    response = client.post("/accounts/12ab/agents", json={"game_id": BURNICE})

    # Then
    assert response.status_code == 422


def test_the_two_conflicts_of_a_write_are_told_apart_by_their_code_not_their_status(
    client: TestClient, session: Session
) -> None:
    """403 and 409 both cover two cases each; only the code says which one happened."""
    # Given
    untracked_account(session)
    account_key = account_key_of(track_account(client))
    agent_id = first_agent_of(client)

    # When
    unclaimed = client.post(f"/accounts/{OTHER_UID}/agents", json={"game_id": BURNICE})
    wrong_key = client.patch(
        f"/agents/{agent_id}", json={"level": 12}, headers=key_headers(WRONG_KEY)
    )
    repeated = client.post(
        f"/accounts/{TRACKED_UID}/agents",
        json={"game_id": first_agent_game_id(client)},
        headers=key_headers(account_key),
    )

    # Then
    assert (unclaimed.status_code, unclaimed.json()["code"]) == (409, "unclaimed_account")
    assert (wrong_key.status_code, wrong_key.json()["code"]) == (403, "forbidden")
    assert (repeated.status_code, repeated.json()["code"]) == (409, "conflict")
