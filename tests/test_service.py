from __future__ import annotations

import copy
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from zzz_tracker.errors import NotFoundError, RateLimitedError
from zzz_tracker.storage.models import SOURCE_ENKA, SOURCE_MANUAL, Account, Agent, utc_now
from zzz_tracker.tracker.service import TrackerService

from .conftest import RATE_LIMITED_UID, TRACKED_UID, UNKNOWN_UID, FakeEnkaNetwork


def agent_of(session: Session, uid: str, game_id: int) -> Agent:
    return session.scalars(
        select(Agent).where(Agent.account_uid == uid, Agent.game_id == game_id)
    ).one()


def expire_ttl(session: Session, uid: str) -> None:
    account = session.get(Account, uid)
    assert account is not None
    account.last_synced_at = (utc_now() - timedelta(hours=1)).replace(tzinfo=None)
    session.commit()


def test_importing_a_uid_stores_the_profile_with_its_agents_and_their_builds(
    service: TrackerService, session: Session
) -> None:
    # When
    account = service.sync_account(TRACKED_UID)

    # Then
    assert account.uid == TRACKED_UID
    assert account.nickname == "Phaethon"
    assert account.level == 55
    assert account.signature == "Proxy at work"
    assert account.sync_ttl_seconds == 60
    assert account.last_synced_at is not None
    assert [agent.game_id for agent in account.agents] == [1041, 1191]

    soldier = agent_of(session, TRACKED_UID, 1041)
    assert soldier.level == 60
    assert soldier.mindscape_level == 3
    assert soldier.skill_levels == {"0": 12, "1": 12, "2": 10, "3": 12, "5": 7, "6": 9}
    assert soldier.source == SOURCE_ENKA
    assert soldier.wengine is not None
    assert soldier.wengine.game_id == 14104
    assert soldier.wengine.modification_level == 5
    assert [disc.slot for disc in soldier.discs] == [1, 2, 3, 4, 5, 6]
    assert soldier.discs[0].game_id == 31041
    assert soldier.discs[0].suit_id == 31000
    assert soldier.discs[0].rarity == 4
    assert soldier.discs[0].main_stat == {"property_id": 11103, "value": 550}
    assert soldier.discs[0].substats[0] == {"property_id": 20103, "value": 24, "rolls": 3}


def test_a_second_import_within_the_ttl_reuses_what_was_already_stored(
    service: TrackerService, enka: FakeEnkaNetwork
) -> None:
    # Given
    service.sync_account(TRACKED_UID)

    # When
    account = service.sync_account(TRACKED_UID)

    # Then
    assert enka.times_queried(TRACKED_UID) == 1
    assert account.nickname == "Phaethon"


def test_forcing_a_sync_refetches_even_while_the_ttl_holds(
    service: TrackerService, enka: FakeEnkaNetwork
) -> None:
    # Given
    service.sync_account(TRACKED_UID)

    # When
    service.sync_account(TRACKED_UID, force=True)

    # Then
    assert enka.times_queried(TRACKED_UID) == 2


def test_once_the_ttl_expires_the_account_is_fetched_again(
    service: TrackerService, session: Session, enka: FakeEnkaNetwork
) -> None:
    # Given
    service.sync_account(TRACKED_UID)
    expire_ttl(session, TRACKED_UID)

    # When
    service.sync_account(TRACKED_UID)

    # Then
    assert enka.times_queried(TRACKED_UID) == 2


def test_a_showcase_that_changed_updates_the_agent_in_place(
    service: TrackerService,
    session: Session,
    enka: FakeEnkaNetwork,
    enka_payload: dict[str, Any],
) -> None:
    # Given
    service.sync_account(TRACKED_UID)
    updated = copy.deepcopy(enka_payload)
    showcased = updated["PlayerInfo"]["ShowcaseDetail"]["AvatarList"][0]
    showcased["TalentLevel"] = 6
    showcased["EquippedList"][0]["Equipment"]["Id"] = 32845
    showcased["EquippedList"][0]["Equipment"]["Level"] = 9
    enka.set_profile(TRACKED_UID, updated)

    # When
    service.sync_account(TRACKED_UID, force=True)

    # Then
    soldier = agent_of(session, TRACKED_UID, 1041)
    assert soldier.mindscape_level == 6
    assert [disc.slot for disc in soldier.discs] == [1, 2, 3, 4, 5, 6]
    assert soldier.discs[0].game_id == 32845
    assert soldier.discs[0].suit_id == 32800
    assert soldier.discs[0].level == 9


def test_syncing_never_overwrites_an_agent_that_was_edited_by_hand(
    service: TrackerService, session: Session
) -> None:
    # Given
    service.sync_account(TRACKED_UID)
    soldier = agent_of(session, TRACKED_UID, 1041)
    soldier.source = SOURCE_MANUAL
    soldier.level = 12
    session.commit()

    # When
    service.sync_account(TRACKED_UID, force=True)

    # Then
    session.expire_all()
    soldier = agent_of(session, TRACKED_UID, 1041)
    assert soldier.level == 12
    assert soldier.source == SOURCE_MANUAL
    assert agent_of(session, TRACKED_UID, 1191).level == 50


def test_agents_pulled_from_the_showcase_survive_when_the_player_stops_showing_them(
    service: TrackerService,
    session: Session,
    enka: FakeEnkaNetwork,
    enka_payload: dict[str, Any],
) -> None:
    # Given
    service.sync_account(TRACKED_UID)
    smaller_showcase = copy.deepcopy(enka_payload)
    smaller_showcase["PlayerInfo"]["ShowcaseDetail"]["AvatarList"] = [
        smaller_showcase["PlayerInfo"]["ShowcaseDetail"]["AvatarList"][0]
    ]
    enka.set_profile(TRACKED_UID, smaller_showcase)

    # When
    account = service.sync_account(TRACKED_UID, force=True)

    # Then
    assert [agent.game_id for agent in account.agents] == [1041, 1191]


def test_importing_a_uid_that_does_not_exist_leaves_nothing_behind(
    service: TrackerService, session: Session
) -> None:
    with pytest.raises(NotFoundError):
        service.sync_account(UNKNOWN_UID)

    assert session.get(Account, UNKNOWN_UID) is None
    assert service.list_accounts() == []


def test_being_throttled_by_enka_surfaces_as_a_rate_limit(service: TrackerService) -> None:
    with pytest.raises(RateLimitedError):
        service.sync_account(RATE_LIMITED_UID)


def test_reading_an_account_that_was_never_imported_is_a_not_found(
    service: TrackerService,
) -> None:
    with pytest.raises(NotFoundError):
        service.get_account(TRACKED_UID)
