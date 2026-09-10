from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from zzz_tracker.app import create_app
from zzz_tracker.config import Settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.storage.models import (
    MODE_DEADLY_ASSAULT,
    MODE_SHIYU_DEFENSE,
    Account,
    AgentBuildSnapshot,
)
from zzz_tracker.tracker.service import TrackerService

from .conftest import (
    FIXTURES_DIR,
    PREVIOUS_SHIYU_SEASON,
    TRACKED_UID,
    UNKNOWN_UID,
    key_headers,
    shiyu_season_never_played,
    track_account,
)

API_TOKEN = "extension-shared-secret"
AUTH = {"Authorization": f"Bearer {API_TOKEN}"}

ANOTHER_UID = "1300000002"
IMPORTED_REGION = "prod_gf_jp"
SHIYU_SEASON = 3902
ASSAULT_SEASON = 2201
ROSTER_SIZE = 4
BANGBOO_COUNT = 3
BUILD_COUNT = 6
BUILD_GAME_IDS = [1091, 1311, 1321, 1371, 1431, 1451]
MIYABI = 1091
SOLDIER_11 = 1041
LYCAON = 1131


def fixture(name: str) -> dict[str, Any]:
    payload: dict[str, Any] = json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))
    return payload


def build_payloads() -> list[dict[str, Any]]:
    """`avatar/info` answers one agent per request, so the section is a list of responses."""
    payloads: list[dict[str, Any]] = json.loads(
        (FIXTURES_DIR / "hoyolab_avatar_info.json").read_text(encoding="utf-8")
    )
    return payloads


def build_of(game_id: int) -> dict[str, Any]:
    """The build the fixture recorded for Miyabi, handed to another agent."""
    payload = build_payloads()[0]
    payload["avatar_list"][0]["id"] = game_id
    return payload


def index_payload(uid: str = TRACKED_UID) -> dict[str, Any]:
    payload = fixture("hoyolab_index.json")
    payload["role"]["game_role_id"] = uid
    return payload


def real_index_payload() -> dict[str, Any]:
    """The `index` a browser actually receives: lists and counters, and no profile at all."""
    payload = fixture("hoyolab_index.json")
    del payload["role"]
    return payload


def record_card_payload(uid: str = TRACKED_UID) -> dict[str, Any]:
    card = fixture("hoyolab_record_card.json")
    card["game_role_id"] = uid
    return card


def full_payloads() -> dict[str, Any]:
    return {
        "index": index_payload(),
        "avatar_basic": fixture("hoyolab_avatar_basic.json"),
        "buddy_info": fixture("hoyolab_buddy_info.json"),
        "shiyu_defense": {"1": fixture("hoyolab_shiyu_v2.json")},
        "deadly_assault": {"1": fixture("hoyolab_deadly_assault.json")},
        "lost_void": fixture("hoyolab_lost_void.json"),
        "avatar_info": build_payloads(),
    }


def import_body(payloads: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "source": "extension",
        "extension_version": "0.1.0",
        "captured_at": "2026-08-18T20:15:00Z",
        "region": IMPORTED_REGION,
        "language": "en-us",
        "payloads": payloads if payloads is not None else full_payloads(),
    }


def import_chronicle(
    client: TestClient,
    body: dict[str, Any] | None = None,
    uid: str = TRACKED_UID,
    account_key: str = "",
    bearer: bool = True,
) -> httpx.Response:
    """Post a bundle, with the shared token this app is configured with unless told not to."""
    headers = dict(AUTH) if bearer else {}
    if account_key:
        headers.update(key_headers(account_key))
    return client.post(
        f"/accounts/{uid}/chronicle/import", json=body or import_body(), headers=headers
    )


def agent_id_of(client: TestClient, game_id: int, uid: str = TRACKED_UID) -> int:
    items = client.get(f"/accounts/{uid}/agents").json()["items"]
    matches = [item["id"] for item in items if item["game_id"] == game_id]
    assert matches, f"agent {game_id} is not tracked"
    return matches[0]


@pytest.fixture
def import_settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"api_token": API_TOKEN})


@pytest.fixture
def import_app(
    import_settings: Settings,
    db_manager: DatabaseManager,
    enka_client: EnkaClient,
    static_data: StaticData,
) -> FastAPI:
    application = create_app(import_settings, enka=enka_client, static=static_data)
    application.state.db = db_manager
    return application


@pytest.fixture
def import_client(import_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(import_app) as test_client:
        yield test_client


def test_a_full_import_stores_the_whole_chronicle_and_tracks_the_account_implicitly(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client)

    assert response.status_code == 200
    body = response.json()
    assert body["account_uid"] == TRACKED_UID
    assert body["agents_synced"] == ROSTER_SIZE
    assert body["bangboos_synced"] == BANGBOO_COUNT
    assert body["lost_void_synced"] is True
    assert body["builds_synced"] == BUILD_COUNT
    assert body["skipped_sections"] == []
    assert body["unavailable_modes"] == []
    assert {(run["mode"], run["schedule_id"]) for run in body["runs"]} == {
        (MODE_SHIYU_DEFENSE, SHIYU_SEASON),
        (MODE_DEADLY_ASSAULT, ASSAULT_SEASON),
    }

    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["nickname"] == "Phaethon"
    assert account["level"] == 55
    assert account["region"] == IMPORTED_REGION
    assert account["chronicle_public"] is True
    assert account["chronicle_synced_at"] is not None
    assert account["chronicle_synced_at"].endswith("Z")

    challenges = import_client.get(f"/accounts/{TRACKED_UID}/challenges").json()["items"]
    assert [(item["mode"], item["schedule_id"]) for item in challenges] == [
        (MODE_DEADLY_ASSAULT, ASSAULT_SEASON),
        (MODE_SHIYU_DEFENSE, SHIYU_SEASON),
    ]
    shiyu = challenges[1]
    assert shiyu.get("score") == 32450
    assert len(shiyu["entries"]) == 5

    bangboos = import_client.get(f"/accounts/{TRACKED_UID}/bangboos").json()["items"]
    assert [item["game_id"] for item in bangboos] == [53001, 53101, 53201]

    lost_void = import_client.get(f"/accounts/{TRACKED_UID}/lost-void").json()
    assert lost_void["license_level"] == 12
    assert lost_void["ultimate_challenge_tier"] == "Tier V"
    assert lost_void["data_collected"] == 86


def test_a_partial_import_stores_what_came_and_reports_the_missing_sections_as_skipped(
    import_client: TestClient,
) -> None:
    payloads = {
        "index": index_payload(),
        "avatar_basic": fixture("hoyolab_avatar_basic.json"),
        "buddy_info": None,
    }

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    body = response.json()
    assert body["agents_synced"] == ROSTER_SIZE
    assert body["bangboos_synced"] == 0
    assert body["lost_void_synced"] is False
    assert body["runs"] == []
    assert body["skipped_sections"] == [
        "buddy_info",
        "shiyu_defense",
        "deadly_assault",
        "lost_void",
        "avatar_info",
    ]
    assert import_client.get(f"/accounts/{TRACKED_UID}/bangboos").json()["items"] == []
    assert import_client.get(f"/accounts/{TRACKED_UID}/challenges").json()["items"] == []


def test_the_record_card_names_the_account_the_index_leaves_anonymous(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["index"] = real_index_payload()
    payloads["record_card"] = record_card_payload()

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["nickname"] == "Proxy Phaethon"
    assert account["level"] == 60


def test_an_import_whose_record_card_belongs_to_another_uid_is_refused(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["index"] = real_index_payload()
    payloads["record_card"] = record_card_payload(uid=ANOTHER_UID)

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert ANOTHER_UID in detail
    assert TRACKED_UID in detail
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404
    assert import_client.get(f"/accounts/{ANOTHER_UID}").status_code == 404


def test_a_record_card_of_another_game_neither_names_nor_refuses_the_account(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["index"] = real_index_payload()
    payloads["record_card"] = dict(record_card_payload(uid=ANOTHER_UID), game_id=2)

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["nickname"] == "Phaethon"


def test_an_import_without_a_record_card_falls_back_to_the_name_the_challenges_carry(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["index"] = real_index_payload()

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    body = response.json()
    assert body["agents_synced"] == ROSTER_SIZE
    assert body["builds_synced"] == BUILD_COUNT
    assert body["skipped_sections"] == []

    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["nickname"] == "Phaethon"
    assert account["level"] == 0


def test_an_import_with_neither_a_record_card_nor_a_challenge_leaves_the_account_unnamed(
    import_client: TestClient,
) -> None:
    payloads = {
        "index": real_index_payload(),
        "avatar_basic": fixture("hoyolab_avatar_basic.json"),
    }

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["nickname"] == ""
    assert account["level"] == 0
    assert account["chronicle_synced_at"] is not None


def test_an_import_without_the_index_payload_is_refused_and_tracks_nothing(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    del payloads["index"]

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 422
    assert "index" in response.json()["detail"]
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_an_import_whose_chronicle_belongs_to_another_uid_is_refused(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["index"] = index_payload(uid=ANOTHER_UID)

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert ANOTHER_UID in detail
    assert TRACKED_UID in detail
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404
    assert import_client.get(f"/accounts/{ANOTHER_UID}").status_code == 404


def test_importing_without_a_token_is_unauthorized_and_stores_nothing(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client, bearer=False)

    assert response.status_code == 401
    assert response.json()["detail"]
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_importing_with_the_wrong_token_is_unauthorized_and_stores_nothing(
    import_client: TestClient,
) -> None:
    response = import_client.post(
        f"/accounts/{TRACKED_UID}/chronicle/import",
        json=import_body(),
        headers={"Authorization": "Bearer not-the-token"},
    )

    assert response.status_code == 401
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_importing_while_no_token_is_configured_goes_through_on_the_bundle_alone(
    client: TestClient,
) -> None:
    """Without ZZZ_API_TOKEN there is no token gate; the bundle is the whole proof."""
    response = import_chronicle(client, bearer=False)

    assert response.status_code == 200
    assert response.json()["account_key"]
    assert client.get(f"/accounts/{TRACKED_UID}").status_code == 200


def test_an_import_leaves_hand_written_agents_untouched(import_client: TestClient) -> None:
    account_key = owned_by_an_import(import_client)
    hand_written = agent_id_of(import_client, 1191)
    import_client.patch(
        f"/agents/{hand_written}",
        json={"level": 12, "mindscape_level": 5},
        headers=key_headers(account_key),
    )

    response = import_chronicle(import_client, account_key=account_key)

    assert response.status_code == 200
    assert response.json()["agents_synced"] == ROSTER_SIZE - 1

    untouched = import_client.get(f"/agents/{hand_written}").json()
    assert untouched["level"] == 12
    assert untouched["mindscape_level"] == 5
    assert untouched["source"] == "manual"

    discovered = import_client.get(f"/agents/{agent_id_of(import_client, 1131)}").json()
    assert discovered["level"] == 50
    assert discovered["mindscape_level"] == 3
    assert discovered["source"] == "hoyolab"


def test_an_import_refreshes_the_roster_but_leaves_the_build_enka_brought_untouched(
    import_client: TestClient,
) -> None:
    import_client.post("/accounts", json={"uid": TRACKED_UID})
    soldier = agent_id_of(import_client, 1041)

    response = import_chronicle(import_client)

    assert response.status_code == 200
    build = import_client.get(f"/agents/{soldier}").json()
    assert build["level"] == 60
    assert build["mindscape_level"] == 6
    assert build["source"] == "enka"
    assert build["skill_levels"] == {"0": 12, "1": 12, "2": 10, "3": 12, "5": 7, "6": 9}
    assert build["wengine"] is not None
    assert build["wengine"]["game_id"] == 14104
    assert [disc["slot"] for disc in build["discs"]] == [1, 2, 3, 4, 5, 6]


def test_an_import_with_avatar_info_writes_the_whole_build_of_every_agent(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client)

    assert response.status_code == 200
    assert response.json()["builds_synced"] == BUILD_COUNT

    miyabi = import_client.get(f"/agents/{agent_id_of(import_client, MIYABI)}").json()
    assert miyabi["source"] == "hoyolab"
    assert miyabi["level"] == 60
    assert miyabi["mindscape_level"] == 0
    assert miyabi["core_skill_enhancement"] == 6
    assert miyabi["skill_levels"] == {"0": 12, "1": 12, "2": 7, "3": 12, "5": 7, "6": 8}
    assert miyabi["wengine"]["game_id"] == 14109
    assert miyabi["wengine"]["level"] == 60
    assert miyabi["wengine"]["phase"] == 1
    assert miyabi["wengine"]["modification_level"] == 5
    assert [disc["slot"] for disc in miyabi["discs"]] == [1, 2, 3, 4, 5, 6]

    first_disc = miyabi["discs"][0]
    assert first_disc["game_id"] == 32741
    assert first_disc["set_id"] == 32700
    assert first_disc["level"] == 15
    assert first_disc["roll_count"] == 5
    assert first_disc["main_stat"]["prop_id"] == 11103
    assert first_disc["main_stat"]["value"] == 2200
    assert [stat["prop_id"] for stat in first_disc["substats"]] == [23203, 12103, 20103, 11102]
    assert first_disc["substats"][1]["value"] == 19
    assert first_disc["substats"][1]["rolls"] == 2


def test_an_import_without_avatar_info_still_works_and_reports_the_section_as_skipped(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    del payloads["avatar_info"]

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    body = response.json()
    assert body["builds_synced"] == 0
    assert body["agents_synced"] == ROSTER_SIZE
    assert body["skipped_sections"] == ["avatar_info"]

    agents = import_client.get(f"/accounts/{TRACKED_UID}/agents").json()["items"]
    assert [agent["game_id"] for agent in agents] == [1041, 1131, 1191, 1211]


def test_a_build_completes_the_agent_the_roster_had_only_named(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["avatar_info"] = [build_of(LYCAON)]

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    assert response.json()["builds_synced"] == 1

    lycaon = import_client.get(f"/agents/{agent_id_of(import_client, LYCAON)}").json()
    assert lycaon["level"] == 60
    assert lycaon["mindscape_level"] == 0
    assert lycaon["source"] == "hoyolab"
    assert lycaon["wengine"] is not None
    assert len(lycaon["discs"]) == 6


def test_a_build_from_the_chronicle_takes_over_the_one_enka_brought(
    import_client: TestClient,
) -> None:
    import_client.post("/accounts", json={"uid": TRACKED_UID})
    soldier = agent_id_of(import_client, SOLDIER_11)
    assert import_client.get(f"/agents/{soldier}").json()["wengine"]["game_id"] == 14104

    payloads = full_payloads()
    payloads["avatar_info"] = [build_of(SOLDIER_11)]

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    build = import_client.get(f"/agents/{soldier}").json()
    assert build["source"] == "hoyolab"
    assert build["wengine"]["game_id"] == 14109
    assert build["skill_levels"] == {"0": 12, "1": 12, "2": 7, "3": 12, "5": 7, "6": 8}
    assert [disc["game_id"] for disc in build["discs"]] == [
        32741,
        32742,
        31043,
        32744,
        31045,
        32746,
    ]


def test_a_build_never_overwrites_an_agent_edited_by_hand(
    import_client: TestClient,
) -> None:
    track_account(import_client)  # Enka brings the build the edit has to preserve
    account_key = owned_by_an_import(import_client)
    soldier = agent_id_of(import_client, SOLDIER_11)
    import_client.patch(
        f"/agents/{soldier}",
        json={"level": 42, "mindscape_level": 1},
        headers=key_headers(account_key),
    )

    payloads = full_payloads()
    payloads["avatar_info"] = [build_of(SOLDIER_11)]

    response = import_chronicle(import_client, import_body(payloads), account_key=account_key)

    assert response.status_code == 200
    assert response.json()["builds_synced"] == 0
    edited = import_client.get(f"/agents/{soldier}").json()
    assert edited["source"] == "manual"
    assert edited["level"] == 42
    assert edited["mindscape_level"] == 1
    assert edited["wengine"]["game_id"] == 14104


def test_an_import_keeps_the_raw_payload_of_every_build_it_read(
    import_client: TestClient, session: Session
) -> None:
    import_chronicle(import_client)

    snapshots = list(
        session.scalars(
            select(AgentBuildSnapshot)
            .where(AgentBuildSnapshot.account_uid == TRACKED_UID)
            .order_by(AgentBuildSnapshot.game_id)
        )
    )
    assert [snapshot.game_id for snapshot in snapshots] == BUILD_GAME_IDS
    assert snapshots[0].raw["full_name_mi18n"] == "Hoshimi Miyabi"
    assert snapshots[0].captured_at is not None


def test_importing_twice_overwrites_the_snapshot_instead_of_piling_them_up(
    import_client: TestClient, session: Session
) -> None:
    """The second import is the same owner coming back, so it carries the key it was given."""
    account_key = import_chronicle(import_client).json()["account_key"]

    payloads = full_payloads()
    levelled = build_payloads()[0]
    levelled["avatar_list"][0]["level"] = 55
    payloads["avatar_info"] = [levelled]
    import_chronicle(import_client, import_body(payloads), account_key=account_key)

    session.expire_all()
    snapshots = list(
        session.scalars(
            select(AgentBuildSnapshot).where(
                AgentBuildSnapshot.account_uid == TRACKED_UID,
                AgentBuildSnapshot.game_id == MIYABI,
            )
        )
    )
    assert len(snapshots) == 1
    assert snapshots[0].raw["level"] == 55


def test_a_season_repeated_across_both_schedules_is_stored_once(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["shiyu_defense"] = {
        "1": fixture("hoyolab_shiyu_v2.json"),
        "2": fixture("hoyolab_shiyu_v2.json"),
    }

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    runs = response.json()["runs"]
    assert [run["schedule_id"] for run in runs if run["mode"] == MODE_SHIYU_DEFENSE] == [
        SHIYU_SEASON
    ]
    challenges = import_client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_SHIYU_DEFENSE}
    ).json()["items"]
    assert [item["schedule_id"] for item in challenges] == [SHIYU_SEASON]


def test_an_import_marks_the_account_as_imported_from_the_extension(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client)

    assert response.status_code == 200
    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["chronicle_import_source"] == "extension"
    assert account["has_owner"] is True


def test_sections_that_come_with_the_wrong_shape_are_skipped_like_missing_ones(
    import_client: TestClient,
) -> None:
    payloads = {
        "index": index_payload(),
        "avatar_basic": [1, 2],
        "buddy_info": "junk",
        "shiyu_defense": {"x": fixture("hoyolab_shiyu_v2.json"), "1": [1]},
        "deadly_assault": 7,
        "lost_void": True,
    }

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    body = response.json()
    assert body["agents_synced"] == 0
    assert body["bangboos_synced"] == 0
    assert body["lost_void_synced"] is False
    assert body["runs"] == []
    assert body["skipped_sections"] == [
        "avatar_basic",
        "buddy_info",
        "shiyu_defense",
        "deadly_assault",
        "lost_void",
        "avatar_info",
    ]
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 200
    assert import_client.get(f"/accounts/{TRACKED_UID}/challenges").json()["items"] == []


def test_a_season_the_player_never_entered_is_reported_unavailable_by_the_import(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["shiyu_defense"]["2"] = shiyu_season_never_played(PREVIOUS_SHIYU_SEASON)

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    body = response.json()
    assert body["unavailable_modes"] == [MODE_SHIYU_DEFENSE]
    assert body["skipped_sections"] == []
    assert [run["schedule_id"] for run in body["runs"] if run["mode"] == MODE_SHIYU_DEFENSE] == [
        SHIYU_SEASON
    ]
    challenges = import_client.get(
        f"/accounts/{TRACKED_UID}/challenges", params={"mode": MODE_SHIYU_DEFENSE}
    ).json()["items"]
    assert [item["schedule_id"] for item in challenges] == [SHIYU_SEASON]


def test_two_simultaneous_imports_of_a_new_account_do_not_collide(
    service: TrackerService, session: Session, db_manager: DatabaseManager
) -> None:
    raced = {"done": False}

    @event.listens_for(session, "before_flush")
    def another_import_wins_the_race(
        racing_session: Session, flush_context: object, instances: object
    ) -> None:
        if raced["done"]:
            return
        raced["done"] = True
        with db_manager.session_factory() as other_session:
            other_session.add(Account(uid=TRACKED_UID))
            other_session.commit()

    report = service.import_chronicle(TRACKED_UID, full_payloads(), region=IMPORTED_REGION)

    assert raced["done"] is True
    assert report.account.uid == TRACKED_UID
    assert report.agents_synced == ROSTER_SIZE
    session.expire_all()
    account = session.get(Account, TRACKED_UID)
    assert account is not None
    assert account.nickname == "Phaethon"
    assert account.chronicle_import_source == "extension"


def test_an_import_for_a_malformed_uid_is_refused_by_the_path_itself(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client, uid="12ab")

    assert response.status_code == 422
    assert import_client.get(f"/accounts/{UNKNOWN_UID}").status_code == 404


def owned_by_an_import(client: TestClient, uid: str = TRACKED_UID) -> str:
    """Import once, which is what gives the account an owner, and keep the key it hands out."""
    response = import_chronicle(client, uid=uid)
    assert response.status_code == 200, response.text
    key: str = response.json()["account_key"]
    assert key
    return key


def any_agent_of(client: TestClient, uid: str = TRACKED_UID) -> int:
    roster = client.get(f"/accounts/{uid}/agents").json()["items"]
    assert roster, f"account {uid} has no agent to edit"
    return int(roster[0]["id"])


def forged_bundle(uid: str = TRACKED_UID) -> dict[str, Any]:
    """What an attacker can put together knowing only a UID, which is public."""
    return import_body({"index": {"role": {"role_id": uid, "nickname": "pwned"}}})


def test_the_first_import_of_a_uid_claims_it_and_hands_out_the_key_that_writes_it(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client)

    assert response.status_code == 200
    account_key = response.json()["account_key"]
    assert account_key.startswith("zzk_")
    assert import_client.get(f"/accounts/{TRACKED_UID}").json()["has_owner"] is True

    edited = import_client.patch(
        f"/agents/{any_agent_of(import_client)}",
        json={"level": 33},
        headers=key_headers(account_key),
    )
    assert edited.status_code == 200


def test_an_import_that_presents_the_key_in_force_keeps_it_instead_of_handing_out_another(
    import_client: TestClient,
) -> None:
    """Importing twice from the same browser must not make the owner write down a new key."""
    account_key = owned_by_an_import(import_client)

    response = import_chronicle(import_client, account_key=account_key)

    assert response.status_code == 200
    assert response.json()["account_key"] is None
    still_valid = import_client.patch(
        f"/agents/{any_agent_of(import_client)}",
        json={"level": 41},
        headers=key_headers(account_key),
    )
    assert still_valid.status_code == 200


def test_a_forged_bundle_cannot_take_over_an_account_that_already_has_an_owner(
    import_client: TestClient,
) -> None:
    """Naming the UID is free — a UID is public — so it cannot outrank the key in force."""
    owner_key = owned_by_an_import(import_client)
    before = import_client.get(f"/accounts/{TRACKED_UID}").json()

    response = import_chronicle(import_client, forged_bundle())

    assert response.status_code == 403
    assert TRACKED_UID in response.json()["detail"]

    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["has_owner"] is True
    assert account["nickname"] == before["nickname"] != "pwned"
    assert account["chronicle_synced_at"] == before["chronicle_synced_at"]
    assert (
        import_client.patch(
            f"/agents/{any_agent_of(import_client)}",
            json={"level": 41},
            headers=key_headers(owner_key),
        ).status_code
        == 200
    )


def test_an_import_with_a_key_that_is_not_the_one_in_force_is_refused_without_rotating(
    import_client: TestClient,
) -> None:
    owner_key = owned_by_an_import(import_client)

    response = import_chronicle(import_client, account_key="zzk_a-key-of-nobody")

    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"
    assert import_chronicle(import_client, account_key=owner_key).status_code == 200


def test_the_key_of_another_account_counts_for_nothing_on_an_import(
    import_client: TestClient, session: Session
) -> None:
    """A key belongs to one UID; holding somebody else's is the same as holding none."""
    owned_by_an_import(import_client)
    session.add(Account(uid=ANOTHER_UID, nickname="Belle"))
    session.commit()
    stranger_key = import_chronicle(
        import_client,
        import_body({"index": {"stats": {"active_days": 1}}}),
        uid=ANOTHER_UID,
    ).json()["account_key"]

    response = import_chronicle(import_client, account_key=stranger_key)

    assert response.status_code == 403
    assert import_client.get(f"/accounts/{ANOTHER_UID}").json()["has_owner"] is True


def test_an_import_whose_role_id_names_another_uid_is_refused_and_claims_nothing(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    del payloads["index"]["role"]["game_role_id"]
    payloads["index"]["role"]["role_id"] = ANOTHER_UID

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 422
    assert ANOTHER_UID in response.json()["detail"]
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_a_bundle_that_names_no_uid_still_claims_an_account_nobody_owns(
    import_client: TestClient,
) -> None:
    """The real `index` carries no UID, so a capture without a record card names nothing."""
    payloads = full_payloads()
    payloads["index"] = real_index_payload()

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    assert response.json()["account_key"].startswith("zzk_")
    assert import_client.get(f"/accounts/{TRACKED_UID}").json()["has_owner"] is True


def test_a_bundle_that_names_no_uid_cannot_take_over_an_account_that_has_an_owner(
    import_client: TestClient,
) -> None:
    owner_key = owned_by_an_import(import_client)
    payloads = full_payloads()
    payloads["index"] = real_index_payload()

    refused = import_chronicle(import_client, import_body(payloads))
    with_the_key = import_chronicle(import_client, import_body(payloads), account_key=owner_key)

    assert refused.status_code == 403
    assert with_the_key.status_code == 200
    assert with_the_key.json()["agents_synced"] == ROSTER_SIZE


def test_with_a_token_configured_the_import_needs_the_bearer_even_holding_the_key(
    import_client: TestClient,
) -> None:
    account_key = owned_by_an_import(import_client)

    response = import_chronicle(import_client, account_key=account_key, bearer=False)

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_an_import_that_names_a_region_that_does_not_exist_is_refused_at_the_door(
    import_client: TestClient,
) -> None:
    """The region says which HoYoLAB server the account lives on; it cannot be invented."""
    body = import_body()
    body["region"] = "prod_gf_pwned"

    response = import_chronicle(import_client, body)

    assert response.status_code == 422
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_a_region_the_service_cannot_place_falls_back_to_the_one_the_uid_implies(
    service: TrackerService,
) -> None:
    """The use case does not trust its caller either, however it was reached."""
    report = service.import_chronicle(TRACKED_UID, full_payloads(), region="prod_gf_pwned")

    assert report.account.region == "prod_gf_jp"
