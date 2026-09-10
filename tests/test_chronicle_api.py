"""Reading back what an imported chronicle left behind.

Every one of these starts with an import, because that is the only door chronicle data
has: this backend never calls HoYoLAB. What they check is the other half — that a stored
season, bangboo or Lost Void run comes back out with the shape the frontend expects.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE

from .conftest import (
    CURRENT_ASSAULT_SEASON,
    CURRENT_SHIYU_SEASON,
    PREVIOUS_ASSAULT_SEASON,
    PREVIOUS_SHIYU_SEASON,
    SCHEDULE_CURRENT,
    TRACKED_UID,
    UNKNOWN_UID,
    chronicle_bundle,
    import_chronicle,
    imported_account,
    shiyu_season_with_every_layer,
    track_account,
)

SHIYU_RANK_PERCENT = 2.5
ASSAULT_RANK_PERCENT = 1.2


def test_the_imported_seasons_are_listed_newest_first_with_their_rank_as_a_percentage(
    client: TestClient,
) -> None:
    imported_account(client)

    response = client.get(f"/accounts/{TRACKED_UID}/challenges")

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


def test_a_listed_season_carries_the_stages_it_was_cleared_with(client: TestClient) -> None:
    imported_account(client)

    response = client.get(
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
    client: TestClient,
) -> None:
    imported_account(client)

    response = client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_DEADLY_ASSAULT}
    )

    items = response.json()["items"]
    assert items
    for item in items:
        assert item["rating"] == ""
        assert [entry["rating"] for entry in item["entries"]] == ["", ""]


def test_shiyu_layers_are_served_nameless_because_hoyolab_does_not_name_them(
    client: TestClient,
) -> None:
    imported_account(client)

    response = client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_SHIYU_DEFENSE}
    )

    current = response.json()["items"][0]
    assert [entry["name"] for entry in current["entries"]] == ["", ""]
    assert [entry["boss_name"] for entry in current["entries"]] == ["", ""]
    assert all(entry["boss_icon"] for entry in current["entries"])


def test_a_shiyu_season_played_on_every_layer_is_served_whole_with_each_layer_identified(
    client: TestClient,
) -> None:
    bundle = chronicle_bundle(
        shiyu={SCHEDULE_CURRENT: shiyu_season_with_every_layer(CURRENT_SHIYU_SEASON)}
    )

    import_chronicle(client, bundle)

    response = client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_SHIYU_DEFENSE}
    )
    current = response.json()["items"][0]
    assert [entry["position"] for entry in current["entries"]] == [1, 2, 3, 4, 5]
    assert [entry["layer_index"] for entry in current["entries"]] == [1, 2, 3, 4, 5]
    assert [entry["layer_id"] for entry in current["entries"]] == [11, 21, 31, 41, 51]
    assert [entry["name"] for entry in current["entries"]] == [
        "Layer 1",
        "Layer 2",
        "Layer 3",
        "Layer 4",
        "Layer 5",
    ]


def test_listing_the_challenges_by_mode_only_returns_that_mode(client: TestClient) -> None:
    imported_account(client)

    response = client.get(
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


def test_an_account_that_was_never_imported_has_no_challenges_to_list(
    client: TestClient,
) -> None:
    track_account(client)

    response = client.get(f"/accounts/{TRACKED_UID}/challenges")

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_the_bangboos_the_import_brought_are_listed(client: TestClient) -> None:
    imported_account(client)

    response = client.get(f"/accounts/{TRACKED_UID}/bangboos")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["game_id"] for item in items] == [53001, 53101]
    assert items[0]["name"] == "Amillion"
    assert items[0]["level"] == 60
    assert items[0]["rarity"] == 4
    assert items[0]["star"] == 5
    assert items[0]["icon"]
    assert items[1]["rarity"] == 3


def test_lost_void_is_not_found_before_the_chronicle_is_imported(client: TestClient) -> None:
    track_account(client)

    response = client.get(f"/accounts/{TRACKED_UID}/lost-void")

    assert response.status_code == 404
    assert TRACKED_UID in response.json()["detail"]


def test_lost_void_comes_back_with_the_progress_after_the_import(client: TestClient) -> None:
    imported_account(client)

    response = client.get(f"/accounts/{TRACKED_UID}/lost-void")

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


def test_lost_void_dates_the_import_in_utc_like_the_challenge_list_does(
    client: TestClient,
) -> None:
    imported_account(client)

    lost_void = client.get(f"/accounts/{TRACKED_UID}/lost-void")
    challenges = client.get(f"/accounts/{TRACKED_UID}/challenges")

    synced_at = lost_void.json()["synced_at"]
    run_synced_at = challenges.json()["items"][0]["synced_at"]
    assert synced_at.endswith("Z")
    assert run_synced_at.endswith("Z")
    assert datetime.fromisoformat(synced_at).utcoffset() == timedelta(0)
    assert datetime.fromisoformat(run_synced_at).utcoffset() == timedelta(0)


def test_an_imported_account_reports_the_server_it_came_from_and_that_it_is_public(
    client: TestClient,
) -> None:
    track_account(client)
    before = client.get(f"/accounts/{TRACKED_UID}").json()

    import_chronicle(client)

    after = client.get(f"/accounts/{TRACKED_UID}").json()
    assert before["chronicle_public"] is False
    assert before["chronicle_synced_at"] is None
    assert after["chronicle_public"] is True
    assert after["chronicle_synced_at"] is not None
    assert after["chronicle_synced_at"].endswith("Z")
    assert after["region"] == before["region"] != ""
    assert after["chronicle_import_source"] == "extension"


def test_reading_the_chronicle_of_an_account_that_is_not_tracked_answers_not_found(
    client: TestClient,
) -> None:
    challenges = client.get(f"/accounts/{UNKNOWN_UID}/challenges")
    bangboos = client.get(f"/accounts/{UNKNOWN_UID}/bangboos")
    lost_void = client.get(f"/accounts/{UNKNOWN_UID}/lost-void")

    assert challenges.status_code == 404
    assert bangboos.status_code == 404
    assert lost_void.status_code == 404
