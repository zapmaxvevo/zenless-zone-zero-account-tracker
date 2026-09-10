from __future__ import annotations

import json
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from zzz_tracker.app import create_app
from zzz_tracker.config import Settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.tracker.service import TrackerService

FIXTURES_DIR = Path(__file__).parent / "fixtures"

TRACKED_UID = "1300000001"
UNKNOWN_UID = "1300000404"
RATE_LIMITED_UID = "1300000429"
CHINESE_UID = "13000001"

ENKA_BASE_URL = "https://enka.test/api/zzz"

# The keys a chronicle bundle uses for the two seasons of a challenge mode. They are
# HoYoLAB's `schedule_type`, which the extension copies into the bundle as it found it.
SCHEDULE_CURRENT = 1
SCHEDULE_PREVIOUS = 2

CURRENT_SHIYU_SEASON = 3902
PREVIOUS_SHIYU_SEASON = 3901
CURRENT_ASSAULT_SEASON = 2102
PREVIOUS_ASSAULT_SEASON = 2101

CHRONICLE_NICKNAME = "Proxy Phaethon"
CHRONICLE_LEVEL = 57


class FakeEnkaNetwork:
    """Enka.Network stand-in: serves recorded payloads and answers domain questions."""

    def __init__(self, profiles: dict[str, dict[str, Any]]) -> None:
        self._profiles = profiles
        self._requested_uids: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        uid = request.url.path.rsplit("/", 1)[-1]
        self._requested_uids.append(uid)
        if uid == RATE_LIMITED_UID:
            return httpx.Response(429, json={"detail": "too many requests"})
        payload = self._profiles.get(uid)
        if payload is None:
            return httpx.Response(404, json={"detail": "player does not exist"})
        return httpx.Response(200, json=payload)

    def as_client(self) -> EnkaClient:
        transport = httpx.MockTransport(self.handle)
        return EnkaClient(base_url=ENKA_BASE_URL, client=httpx.Client(transport=transport))

    def times_queried(self, uid: str) -> int:
        return self._requested_uids.count(uid)

    def was_queried(self) -> bool:
        return bool(self._requested_uids)

    def set_profile(self, uid: str, payload: dict[str, Any]) -> None:
        self._profiles[uid] = payload


def chronicle_profile(
    nickname: str = CHRONICLE_NICKNAME, level: int = CHRONICLE_LEVEL
) -> dict[str, Any]:
    return {
        "stats": {"active_days": 412, "avatar_num": 38, "buddy_num": 12},
        "role": {
            "nickname": nickname,
            "level": level,
            "game_uid": TRACKED_UID,
            "region": "prod_gf_jp",
            "avatar": "https://act-webstatic.hoyoverse.com/zzz/avatar/1041.png",
        },
    }


def roster_agent(game_id: int, level: int, mindscape: int) -> dict[str, Any]:
    return {
        "id": game_id,
        "level": level,
        "rank": mindscape,
        "rarity": "S",
        "element_type": 203,
        "avatar_profession": 4,
        "name_mi18n": f"Agent {game_id}",
        "full_name_mi18n": f"Agent {game_id} of New Eridu",
        "role_square_url": f"https://act-webstatic.hoyoverse.com/zzz/avatar/{game_id}.png",
    }


def chronicle_roster(*agents: dict[str, Any]) -> dict[str, Any]:
    return {"avatar_list": list(agents)}


def chronicle_bangboo(
    game_id: int, name: str, level: int, rarity: str = "S", star: int = 5
) -> dict[str, Any]:
    return {
        "id": game_id,
        "name": name,
        "level": level,
        "rarity": rarity,
        "star": star,
        "bangboo_rectangle_url": f"https://act-webstatic.hoyoverse.com/zzz/buddy/{game_id}.png",
    }


def chronicle_bangboos(*bangboos: dict[str, Any]) -> dict[str, Any]:
    return {"list": list(bangboos)}


def chronicle_lost_void(license_level: int = 6, exploration_log: int = 1200) -> dict[str, Any]:
    return {
        "license_level": license_level,
        "exploration_log": {"cur": exploration_log, "max": 1500},
        "commission_progress": {"done": 8, "total": 10},
        "ultimate_challenge": {"score": 4200, "tier": "Ferocious"},
        "data_collected": {"cur": 46},
    }


def _challenge_time(day: int) -> dict[str, int]:
    return {"year": 2026, "month": 6, "day": day, "hour": 21, "minute": 5, "second": 30}


def _challenge_agents(*game_ids: int) -> list[dict[str, Any]]:
    return [
        {
            "id": game_id,
            "level": 60,
            "rarity": "S",
            "element_type": 203,
            "rank": 2,
            "role_square_url": f"https://act-webstatic.hoyoverse.com/zzz/avatar/{game_id}.png",
        }
        for game_id in game_ids
    ]


SHIYU_MONSTER_NAME = "Doppelganger: Marionette"


def _shiyu_layer(
    zone_name: str,
    rating: str,
    score: int,
    battle_time: int,
    with_names: bool,
    layer_id: int = 41,
) -> dict[str, Any]:
    challenge_info: dict[str, Any] = {
        "layer_id": layer_id,
        "rating": rating,
        "score": score,
        "max_score": 20000,
        "battle_time": battle_time,
        "monster_pic": "https://act-webstatic.hoyoverse.com/zzz/monster/3401.png",
        "buffer": [{"title": "Void Hunger", "text": "Stunned enemies take 15% more DMG."}],
        "buddy": {"id": 53001, "level": 60, "rarity": "S"},
        "avatar_list": _challenge_agents(1041, 1131, 1211),
    }
    if with_names:
        challenge_info["zone_name"] = zone_name
        challenge_info["monster_name"] = SHIYU_MONSTER_NAME
    return {
        "rating": rating,
        "buffer": [{"title": "Nucleus Overload", "text": "Anomaly Buildup Rate increases by 25%."}],
        "challenge_time": _challenge_time(21),
        "layer_challenge_info_list": [challenge_info],
    }


def shiyu_season(
    zone_id: int,
    rating: str = "S+",
    score: int = 32450,
    zone_names: Sequence[str] = ("Corrupted District", "Blazing Boneyard"),
    with_names: bool = False,
) -> dict[str, Any]:
    layer_keys = ("fourth_layer_detail", "fitfh_layer_detail")
    season: dict[str, Any] = {
        "zone_id": zone_id,
        "hadal_begin_time": 1781000000,
        "hadal_end_time": 1782200000,
        "brief": {
            "score": score,
            "max_score": 36000,
            "rank_percent": 250,
            "battle_time": 214,
            "rating": rating,
        },
    }
    for key, zone_name in zip(layer_keys, zone_names, strict=False):
        season[key] = _shiyu_layer(zone_name, rating, score // 2, 96, with_names)
    return {"hadal_ver": "v2", "hadal_info_v2": season}


SHIYU_EVERY_LAYER_KEY = (
    "first_layer_detail",
    "second_layer_detail",
    "third_layer_detail",
    "fourth_layer_detail",
    "fitfh_layer_detail",
)


def shiyu_season_with_every_layer(zone_id: int) -> dict[str, Any]:
    season: dict[str, Any] = {
        "zone_id": zone_id,
        "hadal_begin_time": 1781000000,
        "hadal_end_time": 1782200000,
        "brief": {"score": 32450, "max_score": 36000, "rating": "S+"},
    }
    for index, key in enumerate(SHIYU_EVERY_LAYER_KEY, start=1):
        season[key] = _shiyu_layer(
            f"Layer {index}", "S", 8000, 60, with_names=True, layer_id=index * 10 + 1
        )
    return {"hadal_ver": "v2", "hadal_info_v2": season}


def shiyu_season_never_played(zone_id: int) -> dict[str, Any]:
    return {
        "hadal_ver": "v2",
        "hadal_info_v2": {"zone_id": zone_id, "has_data": False},
    }


def deadly_assault_season(
    zone_id: int,
    total_score: int = 21000,
    boss_names: Sequence[str] = ("Marionette", "Newborn Dead"),
) -> dict[str, Any]:
    return {
        "zone_id": zone_id,
        "start_time": {"year": 2026, "month": 6, "day": 1, "hour": 4, "minute": 0, "second": 0},
        "end_time": {"year": 2026, "month": 6, "day": 15, "hour": 3, "minute": 59, "second": 59},
        "rank_percent": 120,
        "total_score": total_score,
        "max_score": 24000,
        "total_star": 6,
        "battle_time": 320,
        "list": [
            {
                "score": total_score // len(boss_names),
                "star": 3,
                "battle_time": 160,
                "challenge_time": _challenge_time(12 + position),
                "boss": [
                    {
                        "name": boss_name,
                        "icon": f"https://act-webstatic.hoyoverse.com/zzz/boss/{position}.png",
                    }
                ],
                "buffer": [{"title": "Sheer Force", "text": "Sheer DMG increases by 20%."}],
                "avatar_list": _challenge_agents(1241, 1211),
                "buddy": {"id": 53101, "level": 45, "rarity": "A"},
            }
            for position, boss_name in enumerate(boss_names, start=1)
        ],
    }


ACCOUNT_KEY_HEADER = "X-Account-Key"


def key_headers(account_key: str) -> dict[str, str]:
    return {ACCOUNT_KEY_HEADER: account_key}


def account_key_of(response: httpx.Response) -> str:
    key: str = response.json()["account_key"]
    assert key, "the response was expected to hand out an account key"
    return key


def track_account(client: TestClient, uid: str = TRACKED_UID) -> httpx.Response:
    """Start tracking a UID from the web, which is free and owns nothing."""
    return client.post("/accounts", json={"uid": uid})


def chronicle_bundle(
    index: dict[str, Any] | None = None,
    roster: dict[str, Any] | None = None,
    bangboos: dict[str, Any] | None = None,
    lost_void: dict[str, Any] | None = None,
    shiyu: dict[int, dict[str, Any]] | None = None,
    deadly_assault: dict[int, dict[str, Any]] | None = None,
    record_card: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The `payloads` map an extension posts, defaulting to a full, healthy capture.

    Each section is the raw `data` of one HoYoLAB endpoint, exactly as the browser received
    it. Pass a section to change it, or an empty one to say the capture came back with
    nothing to store.
    """
    if shiyu is None:
        shiyu = {
            SCHEDULE_CURRENT: shiyu_season(CURRENT_SHIYU_SEASON),
            SCHEDULE_PREVIOUS: shiyu_season(PREVIOUS_SHIYU_SEASON, rating="S", score=28000),
        }
    if deadly_assault is None:
        deadly_assault = {
            SCHEDULE_CURRENT: deadly_assault_season(CURRENT_ASSAULT_SEASON),
            SCHEDULE_PREVIOUS: deadly_assault_season(PREVIOUS_ASSAULT_SEASON, total_score=18000),
        }
    payloads: dict[str, Any] = {
        "index": chronicle_profile() if index is None else index,
        "avatar_basic": chronicle_roster(
            roster_agent(1041, level=60, mindscape=6),
            roster_agent(1191, level=60, mindscape=4),
            roster_agent(1211, level=55, mindscape=1),
        )
        if roster is None
        else roster,
        "buddy_info": chronicle_bangboos(
            chronicle_bangboo(53001, "Amillion", level=60),
            chronicle_bangboo(53101, "Butler", level=45, rarity="A", star=3),
        )
        if bangboos is None
        else bangboos,
        "lost_void": chronicle_lost_void() if lost_void is None else lost_void,
        "shiyu_defense": {str(schedule): season for schedule, season in shiyu.items()},
        "deadly_assault": {str(schedule): season for schedule, season in deadly_assault.items()},
    }
    if record_card is not None:
        payloads["record_card"] = record_card
    return payloads


def import_chronicle(
    client: TestClient,
    payloads: dict[str, Any] | None = None,
    uid: str = TRACKED_UID,
    account_key: str = "",
    region: str = "prod_gf_jp",
) -> httpx.Response:
    """Post a bundle the way the extension does: the only door chronicle data has."""
    return client.post(
        f"/accounts/{uid}/chronicle/import",
        json={
            "source": "extension",
            "extension_version": "0.1.0",
            "region": region,
            "language": "en-us",
            "payloads": chronicle_bundle() if payloads is None else payloads,
        },
        headers=key_headers(account_key) if account_key else {},
    )


def owned_account(client: TestClient, uid: str = TRACKED_UID) -> str:
    """Track a UID from Enka and take ownership of it, which only an import can give.

    The bundle it claims with is deliberately empty: it adds no agent, no bangboo and no
    season, so a test that cares about the roster still sees exactly what Enka served. The
    key is left on the client, the way a browser keeps it.
    """
    track_account(client, uid)
    empty = chronicle_bundle(
        index={"stats": {"active_days": 1}},
        roster={},
        bangboos={},
        lost_void={},
        shiyu={},
        deadly_assault={},
    )
    account_key = account_key_of(import_chronicle(client, empty, uid=uid))
    client.headers[ACCOUNT_KEY_HEADER] = account_key
    return account_key


def imported_account(client: TestClient, uid: str = TRACKED_UID) -> str:
    """Import once — which is also what gives the account an owner — and keep the key.

    Importing is the only way chronicle data gets in, so every test that reads a challenge,
    a bangboo or the Lost Void starts here.
    """
    response = import_chronicle(client, uid=uid)
    assert response.status_code == 200, response.text
    account_key = account_key_of(response)
    client.headers[ACCOUNT_KEY_HEADER] = account_key
    return account_key


@pytest.fixture
def enka_payload() -> dict[str, Any]:
    raw = (FIXTURES_DIR / "enka_account.json").read_text(encoding="utf-8")
    payload: dict[str, Any] = json.loads(raw)
    return payload


@pytest.fixture
def static_data() -> StaticData:
    return StaticData.from_dir(FIXTURES_DIR / "static")


@pytest.fixture
def enka(enka_payload: dict[str, Any]) -> FakeEnkaNetwork:
    return FakeEnkaNetwork({TRACKED_UID: enka_payload})


@pytest.fixture
def enka_client(enka: FakeEnkaNetwork) -> Iterator[EnkaClient]:
    client = enka.as_client()
    yield client
    client.close()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path}/test.db",
        static_data_dir=str(FIXTURES_DIR / "static"),
        enka_base_url=ENKA_BASE_URL,
    )


@pytest.fixture
def db_manager(settings: Settings) -> DatabaseManager:
    manager = DatabaseManager(settings.database_url)
    manager.create_all()
    return manager


@pytest.fixture
def session(db_manager: DatabaseManager) -> Iterator[Session]:
    with db_manager.session_factory() as db_session:
        yield db_session


@pytest.fixture
def service(session: Session, enka_client: EnkaClient, static_data: StaticData) -> TrackerService:
    return TrackerService(session=session, enka=enka_client, static=static_data)


@pytest.fixture
def app(
    settings: Settings,
    db_manager: DatabaseManager,
    enka_client: EnkaClient,
    static_data: StaticData,
) -> FastAPI:
    application = create_app(settings, enka=enka_client, static=static_data)
    application.state.db = db_manager
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def client_without_static_data(
    settings: Settings, db_manager: DatabaseManager, enka_client: EnkaClient
) -> Iterator[TestClient]:
    application = create_app(settings, enka=enka_client)
    application.state.db = db_manager
    application.state.static = None
    with TestClient(application) as test_client:
        yield test_client
