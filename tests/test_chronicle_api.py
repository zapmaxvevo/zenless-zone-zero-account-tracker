from __future__ import annotations

from datetime import datetime, timedelta

import httpx
from fastapi.testclient import TestClient

from zzz_tracker.hoyolab.client import SCHEDULE_PREVIOUS
from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE

from .conftest import (
    CURRENT_ASSAULT_SEASON,
    CURRENT_SHIYU_SEASON,
    PREVIOUS_ASSAULT_SEASON,
    PREVIOUS_SHIYU_SEASON,
    TRACKED_UID,
    UNKNOWN_UID,
    FakeHoyolab,
    shiyu_season_never_played,
)

LTUID = "224466880"
LTOKEN = "v2_a-secret-hoyolab-token-nobody-should-read-back"

RETCODE_NOT_PUBLIC = 10102
RETCODE_CAPTCHA = 1034
RETCODE_RATE_LIMITED = 10101

SHIYU_RANK_PERCENT = 2.5
ASSAULT_RANK_PERCENT = 1.2


def track_account(client: TestClient) -> None:
    client.post("/accounts", json={"uid": TRACKED_UID})


def store_cookies(client: TestClient, uid: str = TRACKED_UID) -> httpx.Response:
    return client.put(
        f"/accounts/{uid}/credentials",
        json={"ltuid_v2": LTUID, "ltoken_v2": LTOKEN},
    )


def account_ready_to_sync(client: TestClient) -> None:
    track_account(client)
    store_cookies(client)


def sync_chronicle(client: TestClient) -> httpx.Response:
    return client.post(f"/accounts/{TRACKED_UID}/chronicle/sync")


def synced_account(client: TestClient) -> httpx.Response:
    account_ready_to_sync(client)
    return sync_chronicle(client)


def test_storing_the_cookies_answers_the_credential_without_ever_echoing_the_token(
    chronicle_client: TestClient,
) -> None:
    track_account(chronicle_client)

    response = store_cookies(chronicle_client)

    assert response.status_code == 200
    assert LTOKEN not in response.text
    body = response.json()
    assert "ltoken_v2" not in body
    assert "encrypted_ltoken" not in body
    assert body["account_uid"] == TRACKED_UID
    assert body["ltuid_v2"] == LTUID
    assert body["rejected"] is False
    assert body["last_used_at"] is None
    assert body["created_at"] is not None


def test_storing_cookies_for_an_account_that_is_not_tracked_answers_not_found(
    chronicle_client: TestClient,
) -> None:
    response = store_cookies(chronicle_client, uid=UNKNOWN_UID)

    assert response.status_code == 404
    assert UNKNOWN_UID in response.json()["detail"]


def test_cookies_with_an_empty_field_are_rejected_and_nothing_is_stored(
    chronicle_client: TestClient,
) -> None:
    track_account(chronicle_client)

    without_ltuid = chronicle_client.put(
        f"/accounts/{TRACKED_UID}/credentials",
        json={"ltuid_v2": "", "ltoken_v2": LTOKEN},
    )
    without_ltoken = chronicle_client.put(
        f"/accounts/{TRACKED_UID}/credentials",
        json={"ltuid_v2": LTUID, "ltoken_v2": ""},
    )

    assert without_ltuid.status_code == 422
    assert without_ltoken.status_code == 422
    assert chronicle_client.delete(f"/accounts/{TRACKED_UID}/credentials").status_code == 404


def test_deleting_the_stored_cookies_answers_no_content_and_forgets_them(
    chronicle_client: TestClient,
) -> None:
    account_ready_to_sync(chronicle_client)

    response = chronicle_client.delete(f"/accounts/{TRACKED_UID}/credentials")

    assert response.status_code == 204
    assert response.content == b""
    assert sync_chronicle(chronicle_client).status_code == 401


def test_deleting_cookies_that_were_never_stored_answers_not_found(
    chronicle_client: TestClient,
) -> None:
    track_account(chronicle_client)

    response = chronicle_client.delete(f"/accounts/{TRACKED_UID}/credentials")

    assert response.status_code == 404


def test_deleting_cookies_of_an_account_that_is_not_tracked_answers_not_found(
    chronicle_client: TestClient,
) -> None:
    response = chronicle_client.delete(f"/accounts/{UNKNOWN_UID}/credentials")

    assert response.status_code == 404


def test_a_full_sync_reports_everything_the_chronicle_brought_back(
    chronicle_client: TestClient,
) -> None:
    account_ready_to_sync(chronicle_client)

    response = sync_chronicle(chronicle_client)

    assert response.status_code == 200
    body = response.json()
    assert body["account_uid"] == TRACKED_UID
    assert body["skipped"] is False
    assert body["agents_synced"] == 3
    assert body["bangboos_synced"] == 2
    assert body["lost_void_synced"] is True
    assert body["unavailable_modes"] == []
    assert {(run["mode"], run["schedule_id"]) for run in body["runs"]} == {
        (MODE_SHIYU_DEFENSE, CURRENT_SHIYU_SEASON),
        (MODE_SHIYU_DEFENSE, PREVIOUS_SHIYU_SEASON),
        (MODE_DEADLY_ASSAULT, CURRENT_ASSAULT_SEASON),
        (MODE_DEADLY_ASSAULT, PREVIOUS_ASSAULT_SEASON),
    }
    squads = [
        agent for run in body["runs"] for entry in run["entries"] for agent in entry["agents"]
    ]
    assert squads
    assert all(agent["icon"] for agent in squads)


def test_a_sync_that_skips_the_previous_season_only_brings_the_current_one(
    chronicle_client: TestClient, hoyolab: FakeHoyolab
) -> None:
    account_ready_to_sync(chronicle_client)

    response = chronicle_client.post(
        f"/accounts/{TRACKED_UID}/chronicle/sync", params={"previous": False}
    )

    assert response.status_code == 200
    assert {run["schedule_id"] for run in response.json()["runs"]} == {
        CURRENT_SHIYU_SEASON,
        CURRENT_ASSAULT_SEASON,
    }
    assert not hoyolab.was_asked_for_schedule(SCHEDULE_PREVIOUS)


def test_a_season_the_player_never_entered_is_reported_as_unavailable(
    chronicle_client: TestClient, hoyolab: FakeHoyolab
) -> None:
    account_ready_to_sync(chronicle_client)
    hoyolab.serves_shiyu(SCHEDULE_PREVIOUS, shiyu_season_never_played(PREVIOUS_SHIYU_SEASON))

    response = sync_chronicle(chronicle_client)

    assert response.status_code == 200
    body = response.json()
    assert body["unavailable_modes"] == [MODE_SHIYU_DEFENSE]
    assert PREVIOUS_SHIYU_SEASON not in {run["schedule_id"] for run in body["runs"]}


def test_syncing_without_stored_cookies_answers_unauthorized(
    chronicle_client: TestClient, hoyolab: FakeHoyolab
) -> None:
    track_account(chronicle_client)

    response = sync_chronicle(chronicle_client)

    assert response.status_code == 401
    assert response.json()["detail"]
    assert not hoyolab.was_queried()


def test_syncing_an_account_that_is_not_tracked_answers_not_found(
    chronicle_client: TestClient,
) -> None:
    response = chronicle_client.post(f"/accounts/{UNKNOWN_UID}/chronicle/sync")

    assert response.status_code == 404


def test_syncing_a_chronicle_kept_private_answers_forbidden(
    chronicle_client: TestClient, hoyolab: FakeHoyolab
) -> None:
    account_ready_to_sync(chronicle_client)
    hoyolab.answers_with_retcode(RETCODE_NOT_PUBLIC)

    response = sync_chronicle(chronicle_client)

    assert response.status_code == 403
    assert TRACKED_UID in response.json()["detail"]


def test_syncing_while_hoyolab_asks_for_a_captcha_answers_service_unavailable(
    chronicle_client: TestClient, hoyolab: FakeHoyolab
) -> None:
    account_ready_to_sync(chronicle_client)
    hoyolab.answers_with_retcode(RETCODE_CAPTCHA)

    response = sync_chronicle(chronicle_client)

    assert response.status_code == 503
    assert "captcha" in response.json()["detail"]


def test_syncing_while_hoyolab_throttles_the_tracker_answers_too_many_requests(
    chronicle_client: TestClient, hoyolab: FakeHoyolab
) -> None:
    account_ready_to_sync(chronicle_client)
    hoyolab.answers_with_retcode(RETCODE_RATE_LIMITED)

    response = sync_chronicle(chronicle_client)

    assert response.status_code == 429
    assert response.json()["detail"]


def test_the_synced_seasons_are_listed_newest_first_with_their_rank_as_a_percentage(
    chronicle_client: TestClient,
) -> None:
    synced_account(chronicle_client)

    response = chronicle_client.get(f"/accounts/{TRACKED_UID}/challenges")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [(item["mode"], item["schedule_id"]) for item in items] == [
        (MODE_DEADLY_ASSAULT, CURRENT_ASSAULT_SEASON),
        (MODE_DEADLY_ASSAULT, PREVIOUS_ASSAULT_SEASON),
        (MODE_SHIYU_DEFENSE, CURRENT_SHIYU_SEASON),
        (MODE_SHIYU_DEFENSE, PREVIOUS_SHIYU_SEASON),
    ]
    assert items[0]["rank_percent"] == ASSAULT_RANK_PERCENT
    assert items[2]["rank_percent"] == SHIYU_RANK_PERCENT


def test_a_listed_season_carries_the_stages_it_was_cleared_with(
    chronicle_client: TestClient,
) -> None:
    synced_account(chronicle_client)

    response = chronicle_client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_DEADLY_ASSAULT}
    )

    current = response.json()["items"][0]
    assert current["rating"] == ""
    assert current["score"] == 21000
    assert current["total_stars"] == 6
    assert [entry["name"] for entry in current["entries"]] == ["Marionette", "Newborn Dead"]
    first_entry = current["entries"][0]
    assert first_entry["position"] == 1
    assert first_entry["stars"] == 3
    assert first_entry["boss_icon"]
    assert first_entry["bangboo_id"] == 53101
    assert [buff["title"] for buff in first_entry["buffs"]] == ["Sheer Force"]
    assert first_entry["agents"] == [
        {
            "game_id": 1241,
            "level": 60,
            "rarity": "S",
            "element": "203",
            "mindscape": 2,
            "icon": "https://act-webstatic.hoyoverse.com/zzz/avatar/1241.png",
        },
        {
            "game_id": 1211,
            "level": 60,
            "rarity": "S",
            "element": "203",
            "mindscape": 2,
            "icon": "https://act-webstatic.hoyoverse.com/zzz/avatar/1211.png",
        },
    ]


def test_a_deadly_assault_season_hoyolab_sends_no_rating_for_is_served_with_an_empty_rating(
    chronicle_client: TestClient,
) -> None:
    synced_account(chronicle_client)

    response = chronicle_client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_DEADLY_ASSAULT}
    )

    items = response.json()["items"]
    assert items
    for item in items:
        assert item["rating"] == ""
        assert [entry["rating"] for entry in item["entries"]] == ["", ""]


def test_shiyu_layers_are_served_nameless_because_hoyolab_does_not_name_them(
    chronicle_client: TestClient,
) -> None:
    synced_account(chronicle_client)

    response = chronicle_client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_SHIYU_DEFENSE}
    )

    current = response.json()["items"][0]
    assert [entry["name"] for entry in current["entries"]] == ["", ""]
    assert [entry["boss_name"] for entry in current["entries"]] == ["", ""]
    assert all(entry["boss_icon"] for entry in current["entries"])


def test_listing_the_challenges_by_mode_only_returns_that_mode(
    chronicle_client: TestClient,
) -> None:
    synced_account(chronicle_client)

    response = chronicle_client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_SHIYU_DEFENSE}
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["schedule_id"] for item in items] == [
        CURRENT_SHIYU_SEASON,
        PREVIOUS_SHIYU_SEASON,
    ]
    assert {item["mode"] for item in items} == {MODE_SHIYU_DEFENSE}
    assert [entry["position"] for entry in items[0]["entries"]] == [1, 2]
    assert [agent["game_id"] for agent in items[0]["entries"][0]["agents"]] == [1041, 1131, 1211]
    assert [agent["icon"] for agent in items[0]["entries"][0]["agents"]] == [
        "https://act-webstatic.hoyoverse.com/zzz/avatar/1041.png",
        "https://act-webstatic.hoyoverse.com/zzz/avatar/1131.png",
        "https://act-webstatic.hoyoverse.com/zzz/avatar/1211.png",
    ]


def test_an_account_that_never_synced_has_no_challenges_to_list(
    chronicle_client: TestClient,
) -> None:
    track_account(chronicle_client)

    response = chronicle_client.get(f"/accounts/{TRACKED_UID}/challenges")

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_the_bangboos_the_sync_brought_are_listed(chronicle_client: TestClient) -> None:
    synced_account(chronicle_client)

    response = chronicle_client.get(f"/accounts/{TRACKED_UID}/bangboos")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["game_id"] for item in items] == [53001, 53101]
    assert items[0]["name"] == "Amillion"
    assert items[0]["level"] == 60
    assert items[0]["rarity"] == 4
    assert items[0]["star"] == 5
    assert items[0]["icon"]
    assert items[1]["rarity"] == 3


def test_lost_void_is_not_found_before_the_chronicle_is_synced(
    chronicle_client: TestClient,
) -> None:
    account_ready_to_sync(chronicle_client)

    response = chronicle_client.get(f"/accounts/{TRACKED_UID}/lost-void")

    assert response.status_code == 404
    assert TRACKED_UID in response.json()["detail"]


def test_lost_void_comes_back_with_the_progress_after_the_sync(
    chronicle_client: TestClient,
) -> None:
    synced_account(chronicle_client)

    response = chronicle_client.get(f"/accounts/{TRACKED_UID}/lost-void")

    assert response.status_code == 200
    body = response.json()
    assert body["account_uid"] == TRACKED_UID
    assert body["license_level"] == 6
    assert body["exploration_log"] == 1200
    assert body["max_exploration_log"] == 1500
    assert body["commissions_done"] == 8
    assert body["commissions_total"] == 10
    assert body["ultimate_challenge_score"] == 4200
    assert body["ultimate_challenge_tier"] == "Ferocious"
    assert body["data_collected"] == 46
    assert body["synced_at"] is not None


def test_lost_void_dates_the_sync_in_utc_like_the_challenge_list_does(
    chronicle_client: TestClient,
) -> None:
    synced_account(chronicle_client)

    lost_void = chronicle_client.get(f"/accounts/{TRACKED_UID}/lost-void")
    challenges = chronicle_client.get(f"/accounts/{TRACKED_UID}/challenges")

    synced_at = lost_void.json()["synced_at"]
    run_synced_at = challenges.json()["items"][0]["synced_at"]
    assert synced_at.endswith("Z")
    assert run_synced_at.endswith("Z")
    assert datetime.fromisoformat(synced_at).utcoffset() == timedelta(0)
    assert datetime.fromisoformat(run_synced_at).utcoffset() == timedelta(0)


def test_a_synced_account_reports_the_server_it_was_read_from_and_that_it_is_public(
    chronicle_client: TestClient,
) -> None:
    account_ready_to_sync(chronicle_client)
    before = chronicle_client.get(f"/accounts/{TRACKED_UID}").json()

    sync_chronicle(chronicle_client)

    after = chronicle_client.get(f"/accounts/{TRACKED_UID}").json()
    assert before["chronicle_public"] is False
    assert before["chronicle_synced_at"] is None
    assert after["chronicle_public"] is True
    assert after["chronicle_synced_at"] is not None
    assert after["chronicle_synced_at"].endswith("Z")
    assert after["region"] == before["region"] != ""


def test_reading_the_chronicle_of_an_account_that_is_not_tracked_answers_not_found(
    chronicle_client: TestClient,
) -> None:
    challenges = chronicle_client.get(f"/accounts/{UNKNOWN_UID}/challenges")
    bangboos = chronicle_client.get(f"/accounts/{UNKNOWN_UID}/bangboos")
    lost_void = chronicle_client.get(f"/accounts/{UNKNOWN_UID}/lost-void")

    assert challenges.status_code == 404
    assert bangboos.status_code == 404
    assert lost_void.status_code == 404
