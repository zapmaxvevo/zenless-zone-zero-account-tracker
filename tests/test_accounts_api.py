from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import RATE_LIMITED_UID, TRACKED_UID, UNKNOWN_UID, FakeEnkaNetwork


def test_tracking_a_uid_returns_the_imported_account(client: TestClient) -> None:
    response = client.post("/accounts", json={"uid": TRACKED_UID})

    assert response.status_code == 201
    body = response.json()
    assert body["uid"] == TRACKED_UID
    assert body["nickname"] == "Phaethon"
    assert body["level"] == 55
    assert body["agent_count"] == 2
    assert body["last_synced_at"] is not None
    assert body["next_sync_available_at"] is not None


def test_a_tracked_account_can_be_read_back_and_listed(client: TestClient) -> None:
    client.post("/accounts", json={"uid": TRACKED_UID})

    detail = client.get(f"/accounts/{TRACKED_UID}")
    listing = client.get("/accounts")

    assert detail.status_code == 200
    assert detail.json()["nickname"] == "Phaethon"
    assert listing.status_code == 200
    assert [item["uid"] for item in listing.json()["items"]] == [TRACKED_UID]


def test_tracking_a_uid_that_enka_does_not_know_answers_not_found(client: TestClient) -> None:
    response = client.post("/accounts", json={"uid": UNKNOWN_UID})

    assert response.status_code == 404
    assert UNKNOWN_UID in response.json()["detail"]


def test_tracking_a_uid_while_throttled_answers_too_many_requests(client: TestClient) -> None:
    response = client.post("/accounts", json={"uid": RATE_LIMITED_UID})

    assert response.status_code == 429
    assert response.json()["detail"]


def test_a_uid_that_is_not_a_number_is_rejected_before_reaching_enka(
    client: TestClient, enka: FakeEnkaNetwork
) -> None:
    response = client.post("/accounts", json={"uid": "not-a-uid"})

    assert response.status_code == 422
    assert not enka.was_queried()


def test_reading_an_account_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    response = client.get(f"/accounts/{UNKNOWN_UID}")

    assert response.status_code == 404


def test_syncing_a_tracked_account_only_refetches_when_forced(
    client: TestClient, enka: FakeEnkaNetwork
) -> None:
    client.post("/accounts", json={"uid": TRACKED_UID})

    within_ttl = client.post(f"/accounts/{TRACKED_UID}/sync")
    forced = client.post(f"/accounts/{TRACKED_UID}/sync", params={"force": True})

    assert within_ttl.status_code == 200
    assert forced.status_code == 200
    assert forced.json()["nickname"] == "Phaethon"
    assert enka.times_queried(TRACKED_UID) == 2


def test_syncing_an_account_that_is_not_tracked_answers_not_found(client: TestClient) -> None:
    response = client.post(f"/accounts/{UNKNOWN_UID}/sync")

    assert response.status_code == 404
