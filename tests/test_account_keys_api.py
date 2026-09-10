"""Who is allowed to write a tracked account.

Reading is public and stays public. Writing takes the key of the account being written, and
the only thing that hands out a key is importing that account's chronicle — tracking a UID
is free and owns nothing, because a UID is a public number. So these tests ask one question
in several shapes: does this caller hold the key of *this* account? The interesting cases
are the ones where the answer is "a valid key, but of somebody else's account" — agent and
team ids are global, so a key is never a passport.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from zzz_tracker.storage.models import Account

from .conftest import (
    TRACKED_UID,
    account_key_of,
    chronicle_bundle,
    import_chronicle,
    imported_account,
    key_headers,
    track_account,
)

OTHER_UID = "1300000002"
BURNICE = 1221
WRONG_KEY = "zzk_not-the-key-that-owns-anything"


def unowned_account(session: Session, uid: str = OTHER_UID) -> None:
    """An account the way tracking a UID leaves it, and the way the migration left the old
    ones: known to the tracker, owned by nobody."""
    session.add(Account(uid=uid, nickname="Belle"))
    session.commit()


def own_another_account(client: TestClient, uid: str = OTHER_UID) -> str:
    """Claim a second account the only way anything gets claimed: by importing into it.

    Its bundle names no UID — a capture whose record card did not come back — which is
    fine against an account nobody owns and is what the extension really sends sometimes.
    """
    anonymous = chronicle_bundle(index={"stats": {"active_days": 1}})
    return account_key_of(import_chronicle(client, anonymous, uid=uid))


def first_agent_of(client: TestClient, uid: str = TRACKED_UID) -> int:
    roster = client.get(f"/accounts/{uid}/agents").json()["items"]
    return int(roster[0]["id"])


def first_agent_game_id(client: TestClient, uid: str = TRACKED_UID) -> int:
    roster = client.get(f"/accounts/{uid}/agents").json()["items"]
    return int(roster[0]["game_id"])


def comp(agent_id: int, name: str = "Fire team") -> dict[str, Any]:
    return {"name": name, "notes": "", "members": [{"slot": 1, "agent_id": agent_id}]}


def test_tracking_a_uid_from_the_web_owns_nothing_and_hands_out_no_key(
    client: TestClient,
) -> None:
    """Typing a public number says nothing about whose account it is."""
    # Given / When
    response = track_account(client)

    # Then
    assert response.status_code == 201
    body = response.json()
    assert "account_key" not in body
    assert body["has_owner"] is False
    assert client.get(f"/accounts/{TRACKED_UID}").json()["has_owner"] is False


def test_the_first_import_of_a_uid_is_what_gives_it_an_owner(client: TestClient) -> None:
    # Given
    track_account(client)

    # When
    response = import_chronicle(client)

    # Then
    assert response.status_code == 200
    assert response.json()["account_key"].startswith("zzk_")
    assert client.get(f"/accounts/{TRACKED_UID}").json()["has_owner"] is True


def test_the_key_is_never_readable_again_after_the_response_that_issued_it(
    client: TestClient,
) -> None:
    # Given
    account_key = imported_account(client)

    # When
    account = client.get(f"/accounts/{TRACKED_UID}").json()

    # Then
    assert "account_key" not in account
    assert account_key not in client.get(f"/accounts/{TRACKED_UID}").text


def test_writing_an_account_without_the_key_is_forbidden(client: TestClient) -> None:
    # Given
    imported_account(client)
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
    imported_account(client)

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
    account_key = imported_account(client)

    # When
    response = client.post(
        f"/accounts/{TRACKED_UID}/agents",
        json={"game_id": BURNICE},
        headers=key_headers(account_key),
    )

    # Then
    assert response.status_code == 201
    assert response.json()["game_id"] == BURNICE


def test_writing_an_account_nobody_owns_points_at_the_import_that_would_claim_it(
    client: TestClient, session: Session
) -> None:
    # Given
    unowned_account(session)

    # When
    response = client.post(f"/accounts/{OTHER_UID}/agents", json={"game_id": BURNICE})

    # Then
    assert response.status_code == 409
    assert response.json()["code"] == "unclaimed_account"
    assert "extension" in response.json()["detail"]
    assert client.get(f"/accounts/{OTHER_UID}/agents").json()["items"] == []


def test_editing_an_agent_is_settled_by_the_account_that_owns_it_and_not_by_the_url(
    client: TestClient,
) -> None:
    """`PATCH /agents/{id}` names no account, so the row is what says which key to ask for."""
    # Given
    account_key = imported_account(client)
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
    """A perfectly valid key, of the wrong account: claiming a free UID is free."""
    # Given
    imported_account(client)
    agent_id = first_agent_of(client)
    stranger_key = own_another_account(client)

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
    account_key = imported_account(client)
    agent_id = first_agent_of(client)
    team_id = client.post(
        f"/accounts/{TRACKED_UID}/teams",
        json=comp(agent_id),
        headers=key_headers(account_key),
    ).json()["id"]
    stranger_key = own_another_account(client)

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


def test_a_team_of_an_owned_account_is_written_with_the_key_of_that_account(
    client: TestClient,
) -> None:
    # Given
    stranger_key = own_another_account(client)
    stranger_agent = first_agent_of(client, OTHER_UID)

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
    unowned_account(session)
    account_key = imported_account(client)
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


def test_the_right_key_is_confirmed_without_writing_or_echoing_anything(
    client: TestClient,
) -> None:
    """Pasting a key by hand is how a second machine gets one, so it can be checked first."""
    # Given
    account_key = imported_account(client)
    before = client.get(f"/accounts/{TRACKED_UID}").json()

    # When
    response = client.get(f"/accounts/{TRACKED_UID}/ownership", headers=key_headers(account_key))

    # Then
    assert response.status_code == 204
    assert response.content == b""
    assert account_key not in response.text
    assert account_key not in str(response.headers)
    assert client.get(f"/accounts/{TRACKED_UID}").json() == before


def test_a_key_that_does_not_own_the_account_is_refused_by_the_check(
    client: TestClient, session: Session
) -> None:
    # Given
    imported_account(client)
    stranger_key = own_another_account(client)
    del client.headers["X-Account-Key"]

    # When
    without_key = client.get(f"/accounts/{TRACKED_UID}/ownership")
    with_a_stranger_key = client.get(
        f"/accounts/{TRACKED_UID}/ownership", headers=key_headers(stranger_key)
    )
    with_nonsense = client.get(f"/accounts/{TRACKED_UID}/ownership", headers=key_headers(WRONG_KEY))

    # Then
    for response in (without_key, with_a_stranger_key, with_nonsense):
        assert response.status_code == 403
        assert response.json()["code"] == "forbidden"


def test_checking_a_uid_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    # Given / When
    response = client.get(f"/accounts/{OTHER_UID}/ownership", headers=key_headers(WRONG_KEY))

    # Then
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_checking_an_account_nobody_owns_says_so_instead_of_refusing_the_key(
    client: TestClient, session: Session
) -> None:
    """A UID with no owner is not a wrong key: there is no key to be wrong about yet."""
    # Given
    unowned_account(session)

    # When
    response = client.get(f"/accounts/{OTHER_UID}/ownership", headers=key_headers(WRONG_KEY))

    # Then
    assert response.status_code == 409
    assert response.json()["code"] == "unclaimed_account"
