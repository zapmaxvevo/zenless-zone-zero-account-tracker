from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from zzz_tracker.app import create_app
from zzz_tracker.config import Settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.hoyolab.client import HoyolabClient
from zzz_tracker.storage.crypto import CredentialCipher
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE, Account
from zzz_tracker.tracker.service import TrackerService

from .conftest import (
    FIXTURES_DIR,
    PREVIOUS_SHIYU_SEASON,
    TRACKED_UID,
    UNKNOWN_UID,
    shiyu_season_never_played,
)

API_TOKEN = "extension-shared-secret"
AUTH = {"Authorization": f"Bearer {API_TOKEN}"}

ANOTHER_UID = "1300000002"
IMPORTED_REGION = "prod_gf_jp"
SHIYU_SEASON = 3902
ASSAULT_SEASON = 2201
ROSTER_SIZE = 4
BANGBOO_COUNT = 3

LTUID = "81002000"
LTOKEN = "v2_the-secret-cookie"


def fixture(name: str) -> dict[str, Any]:
    payload: dict[str, Any] = json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))
    return payload


def index_payload(uid: str = TRACKED_UID) -> dict[str, Any]:
    payload = fixture("hoyolab_index.json")
    payload["role"]["game_role_id"] = uid
    return payload


def full_payloads() -> dict[str, Any]:
    return {
        "index": index_payload(),
        "avatar_basic": fixture("hoyolab_avatar_basic.json"),
        "buddy_info": fixture("hoyolab_buddy_info.json"),
        "shiyu_defense": {"1": fixture("hoyolab_shiyu_v2.json")},
        "deadly_assault": {"1": fixture("hoyolab_deadly_assault.json")},
        "lost_void": fixture("hoyolab_lost_void.json"),
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
    headers: dict[str, str] = AUTH,
) -> httpx.Response:
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
    hoyolab_client: HoyolabClient,
    cipher: CredentialCipher,
) -> FastAPI:
    application = create_app(
        import_settings,
        enka=enka_client,
        static=static_data,
        hoyolab=hoyolab_client,
        cipher=cipher,
    )
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
    assert body["skipped"] is False
    assert body["agents_synced"] == ROSTER_SIZE
    assert body["bangboos_synced"] == BANGBOO_COUNT
    assert body["lost_void_synced"] is True
    assert body["builds_synced"] == 0
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
    ]
    assert import_client.get(f"/accounts/{TRACKED_UID}/bangboos").json()["items"] == []
    assert import_client.get(f"/accounts/{TRACKED_UID}/challenges").json()["items"] == []


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
    response = import_chronicle(import_client, headers={})

    assert response.status_code == 401
    assert response.json()["detail"]
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_importing_with_the_wrong_token_is_unauthorized_and_stores_nothing(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client, headers={"Authorization": "Bearer not-the-token"})

    assert response.status_code == 401
    assert import_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_importing_while_no_token_is_configured_answers_service_unavailable(
    chronicle_client: TestClient,
) -> None:
    response = import_chronicle(chronicle_client)

    assert response.status_code == 503
    assert "ZZZ_API_TOKEN" in response.json()["detail"]
    assert chronicle_client.get(f"/accounts/{TRACKED_UID}").status_code == 404


def test_an_import_leaves_hand_written_agents_untouched(import_client: TestClient) -> None:
    import_client.post("/accounts", json={"uid": TRACKED_UID})
    hand_written = agent_id_of(import_client, 1191)
    import_client.patch(f"/agents/{hand_written}", json={"level": 12, "mindscape_level": 5})

    response = import_chronicle(import_client)

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


def test_the_avatar_info_payload_is_accepted_but_writes_no_builds_yet(
    import_client: TestClient,
) -> None:
    payloads = full_payloads()
    payloads["avatar_info"] = [{"avatar_list": [{"id": 1131, "level": 50}]}]

    response = import_chronicle(import_client, import_body(payloads))

    assert response.status_code == 200
    body = response.json()
    assert body["builds_synced"] == 0
    assert body["skipped_sections"] == ["avatar_info"]

    discovered = import_client.get(f"/agents/{agent_id_of(import_client, 1131)}").json()
    assert discovered["wengine"] is None
    assert discovered["discs"] == []


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


def test_an_import_never_touches_the_stored_hoyolab_credentials(
    import_client: TestClient, session: Session
) -> None:
    import_client.post("/accounts", json={"uid": TRACKED_UID})
    import_client.put(
        f"/accounts/{TRACKED_UID}/credentials",
        json={"ltuid_v2": LTUID, "ltoken_v2": LTOKEN},
    )

    response = import_chronicle(import_client)

    assert response.status_code == 200
    session.expire_all()
    account = session.get(Account, TRACKED_UID)
    assert account is not None
    assert account.credential is not None
    assert account.credential.last_used_at is None
    assert account.credential.rejected_at is None
    assert account.chronicle_synced_at is not None


def test_an_import_marks_the_account_as_imported_from_the_extension(
    import_client: TestClient,
) -> None:
    response = import_chronicle(import_client)

    assert response.status_code == 200
    account = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert account["chronicle_import_source"] == "extension"
    assert account["has_hoyolab_credentials"] is False


def test_an_import_after_a_server_sync_takes_over_as_the_latest_import_source(
    import_client: TestClient,
) -> None:
    import_client.post("/accounts", json={"uid": TRACKED_UID})
    import_client.put(
        f"/accounts/{TRACKED_UID}/credentials",
        json={"ltuid_v2": LTUID, "ltoken_v2": LTOKEN},
    )
    import_client.post(f"/accounts/{TRACKED_UID}/chronicle/sync")
    synced = import_client.get(f"/accounts/{TRACKED_UID}").json()

    import_chronicle(import_client)

    imported = import_client.get(f"/accounts/{TRACKED_UID}").json()
    assert synced["chronicle_import_source"] == "server"
    assert imported["chronicle_import_source"] == "extension"
    assert imported["has_hoyolab_credentials"] is True


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
    chronicle_service: TrackerService, session: Session, db_manager: DatabaseManager
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

    report = chronicle_service.import_chronicle(
        TRACKED_UID, full_payloads(), region=IMPORTED_REGION
    )

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
