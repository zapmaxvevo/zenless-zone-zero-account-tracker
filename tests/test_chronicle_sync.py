from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from zzz_tracker.errors import (
    InvalidCredentialsError,
    MissingCredentialsError,
    ValidationError,
)
from zzz_tracker.hoyolab.client import SCHEDULE_CURRENT, SCHEDULE_PREVIOUS
from zzz_tracker.storage.models import (
    MODE_DEADLY_ASSAULT,
    MODE_SHIYU_DEFENSE,
    SOURCE_ENKA,
    SOURCE_HOYOLAB,
    SOURCE_MANUAL,
    Account,
    Agent,
    ChallengeRunEntry,
    as_utc,
)
from zzz_tracker.tracker.service import AgentEdit, TrackerService

from .conftest import (
    CHINESE_UID,
    CHRONICLE_LEVEL,
    CHRONICLE_NICKNAME,
    CURRENT_ASSAULT_SEASON,
    CURRENT_SHIYU_SEASON,
    PATH_BANGBOOS,
    PATH_DEADLY_ASSAULT,
    PATH_LOST_VOID,
    PATH_PROFILE,
    PATH_SHIYU,
    PREVIOUS_ASSAULT_SEASON,
    PREVIOUS_SHIYU_SEASON,
    RETCODE_INVALID_COOKIES,
    SHIYU_MONSTER_NAME,
    TRACKED_UID,
    FakeHoyolab,
    chronicle_profile,
    shiyu_season,
    shiyu_season_never_played,
)

LTUID = "81002000"
LTOKEN = "v2_the-secret-cookie"
NEXT_SHIYU_SEASON = 3903
JAPAN_REGION = "prod_gf_jp"


def track_account(session: Session, uid: str = TRACKED_UID) -> Account:
    account = Account(uid=uid)
    session.add(account)
    session.commit()
    return account


def account_with_cookies(
    service: TrackerService, session: Session, uid: str = TRACKED_UID
) -> Account:
    account = track_account(session, uid)
    service.store_credentials(uid, LTUID, LTOKEN)
    return account


def account_of(session: Session, uid: str = TRACKED_UID) -> Account:
    account = session.get(Account, uid)
    assert account is not None
    return account


def agent_of(session: Session, uid: str, game_id: int) -> Agent:
    return session.scalars(
        select(Agent).where(Agent.account_uid == uid, Agent.game_id == game_id)
    ).one()


def stored_entries(session: Session) -> int:
    return session.scalars(select(func.count()).select_from(ChallengeRunEntry)).one()


def seasons_of(service: TrackerService, mode: str, uid: str = TRACKED_UID) -> list[int]:
    return [run.schedule_id for run in service.list_challenge_runs(uid, mode)]


def test_a_sync_stores_the_current_and_the_previous_season_of_both_challenge_modes(
    chronicle_service: TrackerService, session: Session
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    assert report.skipped is False
    assert report.unavailable_modes == ()
    assert [(run.mode, run.schedule_id) for run in report.runs] == [
        (MODE_SHIYU_DEFENSE, CURRENT_SHIYU_SEASON),
        (MODE_DEADLY_ASSAULT, CURRENT_ASSAULT_SEASON),
        (MODE_SHIYU_DEFENSE, PREVIOUS_SHIYU_SEASON),
        (MODE_DEADLY_ASSAULT, PREVIOUS_ASSAULT_SEASON),
    ]

    account = account_of(session)
    assert account.nickname == CHRONICLE_NICKNAME
    assert account.level == CHRONICLE_LEVEL
    assert account.region == JAPAN_REGION
    assert account.chronicle_public is True
    assert account.chronicle_synced_at is not None

    assert seasons_of(chronicle_service, MODE_SHIYU_DEFENSE) == [
        CURRENT_SHIYU_SEASON,
        PREVIOUS_SHIYU_SEASON,
    ]
    shiyu = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_SHIYU_DEFENSE)[0]
    assert shiyu.has_data is True
    assert shiyu.rating == "S+"
    assert shiyu.score == 32450
    assert shiyu.max_score == 36000
    assert shiyu.total_stars == 6
    assert shiyu.rank_percent == 250
    assert shiyu.clear_time_seconds == 214
    assert shiyu.schema_version == "v2"
    assert [(entry.position, entry.score) for entry in shiyu.entries] == [(1, 16225), (2, 16225)]
    first_layer = shiyu.entries[0]
    assert first_layer.rating == "S+"
    assert first_layer.score == 16225
    assert first_layer.clear_time_seconds == 96
    assert first_layer.boss_icon == "https://act-webstatic.hoyoverse.com/zzz/monster/3401.png"
    assert first_layer.bangboo_id == 53001
    assert [agent["game_id"] for agent in first_layer.agents] == [1041, 1131, 1211]
    assert as_utc(first_layer.challenged_at) == datetime(2026, 6, 21, 21, 5, 30, tzinfo=UTC)

    assert seasons_of(chronicle_service, MODE_DEADLY_ASSAULT) == [
        CURRENT_ASSAULT_SEASON,
        PREVIOUS_ASSAULT_SEASON,
    ]
    assault = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_DEADLY_ASSAULT)[0]
    assert assault.has_data is True
    assert assault.rating == ""
    assert assault.score == 21000
    assert assault.max_score == 24000
    assert assault.total_stars == 6
    assert assault.rank_percent == 120
    assert as_utc(assault.begin_time) == datetime(2026, 6, 1, 4, 0, 0, tzinfo=UTC)
    assert [(entry.position, entry.boss_name) for entry in assault.entries] == [
        (1, "Marionette"),
        (2, "Newborn Dead"),
    ]
    assert assault.entries[0].score == 10500
    assert assault.entries[0].stars == 3
    assert as_utc(assault.entries[0].challenged_at) == datetime(2026, 6, 13, 21, 5, 30, tzinfo=UTC)


def test_a_deadly_assault_season_hoyolab_sends_no_rating_for_is_stored_without_one(
    chronicle_service: TrackerService, session: Session
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)

    # When
    chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    for run in chronicle_service.list_challenge_runs(TRACKED_UID, MODE_DEADLY_ASSAULT):
        assert run.rating == ""
        assert [entry.rating for entry in run.entries] == ["", ""]
        assert run.total_stars == 6
        assert [entry.stars for entry in run.entries] == [3, 3]


def test_shiyu_layers_hoyolab_sends_without_zone_or_monster_names_are_stored_nameless(
    chronicle_service: TrackerService, session: Session
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)

    # When
    chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    current = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_SHIYU_DEFENSE)[0]
    assert [entry.name for entry in current.entries] == ["", ""]
    assert [entry.boss_name for entry in current.entries] == ["", ""]
    assert all(entry.boss_icon for entry in current.entries)


def test_a_shiyu_season_that_does_carry_zone_and_monster_names_stores_them(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    hoyolab.serves_shiyu(
        SCHEDULE_CURRENT,
        shiyu_season(
            CURRENT_SHIYU_SEASON,
            zone_names=("Corrupted District", "Blazing Boneyard"),
            with_names=True,
        ),
    )

    # When
    chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    current = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_SHIYU_DEFENSE)[0]
    assert [entry.name for entry in current.entries] == [
        "Corrupted District",
        "Blazing Boneyard",
    ]
    assert [entry.boss_name for entry in current.entries] == [
        SHIYU_MONSTER_NAME,
        SHIYU_MONSTER_NAME,
    ]


def test_syncing_a_season_that_was_already_stored_rewrites_it_instead_of_duplicating_it(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    chronicle_service.sync_chronicle(TRACKED_UID)
    hoyolab.serves_shiyu(
        SCHEDULE_CURRENT,
        shiyu_season(
            CURRENT_SHIYU_SEASON,
            rating="S",
            score=20000,
            zone_names=("Reclaimed District",),
        ),
    )

    # When
    chronicle_service.sync_chronicle(TRACKED_UID, force=True)

    # Then
    session.expire_all()
    assert seasons_of(chronicle_service, MODE_SHIYU_DEFENSE) == [
        CURRENT_SHIYU_SEASON,
        PREVIOUS_SHIYU_SEASON,
    ]
    rewritten = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_SHIYU_DEFENSE)[0]
    assert rewritten.rating == "S"
    assert rewritten.score == 20000
    assert rewritten.total_stars == 3
    assert [(entry.position, entry.score) for entry in rewritten.entries] == [(1, 10000)]
    assert stored_entries(session) == 7


def test_a_season_hoyolab_no_longer_serves_survives_in_the_stored_history(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    chronicle_service.sync_chronicle(TRACKED_UID)
    hoyolab.serves_shiyu(SCHEDULE_CURRENT, shiyu_season(NEXT_SHIYU_SEASON, score=30000))
    hoyolab.serves_shiyu(SCHEDULE_PREVIOUS, shiyu_season(CURRENT_SHIYU_SEASON))

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID, force=True)

    # Then
    session.expire_all()
    assert seasons_of(chronicle_service, MODE_SHIYU_DEFENSE) == [
        NEXT_SHIYU_SEASON,
        CURRENT_SHIYU_SEASON,
        PREVIOUS_SHIYU_SEASON,
    ]
    assert [run.schedule_id for run in report.runs if run.mode == MODE_SHIYU_DEFENSE] == [
        NEXT_SHIYU_SEASON,
        CURRENT_SHIYU_SEASON,
    ]
    forgotten = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_SHIYU_DEFENSE)[2]
    assert forgotten.rating == "S"
    assert forgotten.score == 28000
    assert [(entry.position, entry.score) for entry in forgotten.entries] == [
        (1, 14000),
        (2, 14000),
    ]


def test_a_second_sync_within_the_ttl_reuses_what_was_already_stored(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    chronicle_service.sync_chronicle(TRACKED_UID)
    hoyolab.forget_what_was_asked()

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    assert report.skipped is True
    assert report.runs == ()
    assert report.agents_synced == 0
    assert report.lost_void_synced is False
    assert hoyolab.was_queried() is False
    assert seasons_of(chronicle_service, MODE_SHIYU_DEFENSE) == [
        CURRENT_SHIYU_SEASON,
        PREVIOUS_SHIYU_SEASON,
    ]


def test_forcing_a_sync_asks_hoyolab_again_even_while_the_ttl_holds(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    chronicle_service.sync_chronicle(TRACKED_UID)
    hoyolab.forget_what_was_asked()

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID, force=True)

    # Then
    assert report.skipped is False
    assert hoyolab.times_queried(PATH_SHIYU) == 2
    assert hoyolab.was_asked_for_schedule(SCHEDULE_PREVIOUS) is True
    assert len(report.runs) == 4


def test_the_roster_refreshes_synced_agents_adds_the_missing_ones_and_spares_the_hand_written_ones(
    chronicle_service: TrackerService, session: Session
) -> None:
    # Given
    chronicle_service.sync_account(TRACKED_UID)
    chronicle_service.store_credentials(TRACKED_UID, LTUID, LTOKEN)
    hand_written = agent_of(session, TRACKED_UID, 1191)
    chronicle_service.update_agent(hand_written.id, AgentEdit(level=12, mindscape_level=5))

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    assert report.agents_synced == 2

    refreshed = agent_of(session, TRACKED_UID, 1041)
    assert refreshed.level == 60
    assert refreshed.mindscape_level == 6
    assert refreshed.source == SOURCE_ENKA

    untouched = agent_of(session, TRACKED_UID, 1191)
    assert untouched.level == 12
    assert untouched.mindscape_level == 5
    assert untouched.source == SOURCE_MANUAL

    discovered = agent_of(session, TRACKED_UID, 1211)
    assert discovered.level == 55
    assert discovered.mindscape_level == 1
    assert discovered.source == SOURCE_HOYOLAB


def test_a_chronicle_sync_leaves_the_build_imported_from_enka_untouched(
    chronicle_service: TrackerService, session: Session
) -> None:
    # Given
    chronicle_service.sync_account(TRACKED_UID)
    chronicle_service.store_credentials(TRACKED_UID, LTUID, LTOKEN)

    # When
    chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    soldier = agent_of(session, TRACKED_UID, 1041)
    assert soldier.mindscape_level == 6
    assert soldier.skill_levels == {"0": 12, "1": 12, "2": 10, "3": 12, "5": 7, "6": 9}
    assert soldier.wengine is not None
    assert soldier.wengine.game_id == 14104
    assert soldier.wengine.level == 60
    assert soldier.wengine.modification_level == 5
    assert [disc.slot for disc in soldier.discs] == [1, 2, 3, 4, 5, 6]
    assert soldier.discs[0].game_id == 31041
    assert soldier.discs[0].set_id == 31000
    assert soldier.discs[0].main_stat_value == 550
    assert soldier.discs[0].substats[0] == {"prop_id": 20103, "value": 240, "rolls": 3}


def test_syncing_an_account_with_no_stored_cookies_asks_for_them_before_reaching_hoyolab(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    track_account(session)

    # When
    with pytest.raises(MissingCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    assert hoyolab.was_queried() is False
    assert chronicle_service.list_challenge_runs(TRACKED_UID) == []
    assert account_of(session).chronicle_synced_at is None


def test_cookies_hoyolab_rejects_are_marked_as_rejected_and_are_not_retried(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    hoyolab.rejects_the_cookies()

    # When
    with pytest.raises(InvalidCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    credential = account_of(session).credential
    assert credential is not None
    assert credential.rejected_at is not None
    assert chronicle_service.list_challenge_runs(TRACKED_UID) == []

    hoyolab.forget_what_was_asked()
    with pytest.raises(InvalidCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID)
    assert hoyolab.was_queried() is False


def test_a_chinese_uid_is_refused_without_reaching_hoyolab(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session, CHINESE_UID)

    # When
    with pytest.raises(ValidationError):
        chronicle_service.sync_chronicle(CHINESE_UID)

    # Then
    assert hoyolab.was_queried() is False
    assert chronicle_service.list_challenge_runs(CHINESE_UID) == []
    assert account_of(session, CHINESE_UID).chronicle_synced_at is None


def test_the_stored_cookies_are_kept_encrypted_and_come_back_readable(
    chronicle_service: TrackerService, session: Session
) -> None:
    # Given
    track_account(session)

    # When
    chronicle_service.store_credentials(TRACKED_UID, LTUID, LTOKEN)

    # Then
    session.expire_all()
    stored = account_of(session).credential
    assert stored is not None
    assert stored.ltuid_v2 == LTUID
    assert stored.encrypted_ltoken != LTOKEN
    assert LTOKEN not in stored.encrypted_ltoken
    assert stored.rejected_at is None

    recovered = chronicle_service.credentials_for(TRACKED_UID)
    assert recovered.ltuid_v2 == LTUID
    assert recovered.ltoken_v2 == LTOKEN


def test_deleting_the_cookies_leaves_the_account_unable_to_sync_again(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)

    # When
    chronicle_service.delete_credentials(TRACKED_UID)

    # Then
    session.expire_all()
    assert account_of(session).credential is None
    with pytest.raises(MissingCredentialsError):
        chronicle_service.credentials_for(TRACKED_UID)
    with pytest.raises(MissingCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID)
    assert hoyolab.was_queried() is False


def test_a_sync_stores_the_bangboo_box_and_the_lost_void_progress(
    chronicle_service: TrackerService, session: Session
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    assert report.bangboos_synced == 2
    assert report.lost_void_synced is True

    bangboos = chronicle_service.list_bangboos(TRACKED_UID)
    assert [
        (bangboo.game_id, bangboo.name, bangboo.level, bangboo.rarity, bangboo.star)
        for bangboo in bangboos
    ] == [(53001, "Amillion", 60, 4, 5), (53101, "Butler", 45, 3, 3)]

    progress = chronicle_service.find_lost_void(TRACKED_UID)
    assert progress is not None
    assert progress.license_level == 6
    assert progress.exploration_log == 1200
    assert progress.max_exploration_log == 1500
    assert progress.commissions_done == 8
    assert progress.commissions_total == 10
    assert progress.ultimate_challenge_score == 4200
    assert progress.ultimate_challenge_tier == "Ferocious"
    assert progress.data_collected == 46


def test_a_season_the_player_never_entered_stores_no_run_and_is_reported_as_unavailable(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    hoyolab.serves_shiyu(SCHEDULE_PREVIOUS, shiyu_season_never_played(PREVIOUS_SHIYU_SEASON))

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    assert report.unavailable_modes == (MODE_SHIYU_DEFENSE,)
    assert [run.schedule_id for run in report.runs] == [
        CURRENT_SHIYU_SEASON,
        CURRENT_ASSAULT_SEASON,
        PREVIOUS_ASSAULT_SEASON,
    ]
    assert seasons_of(chronicle_service, MODE_SHIYU_DEFENSE) == [CURRENT_SHIYU_SEASON]
    assert seasons_of(chronicle_service, MODE_DEADLY_ASSAULT) == [
        CURRENT_ASSAULT_SEASON,
        PREVIOUS_ASSAULT_SEASON,
    ]


def test_cookies_that_expire_halfway_through_a_sync_only_persist_the_rejection(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    hoyolab.answers_with_retcode(RETCODE_INVALID_COOKIES, PATH_DEADLY_ASSAULT)

    # When
    with pytest.raises(InvalidCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    assert hoyolab.times_queried(PATH_PROFILE) == 1
    assert hoyolab.times_queried(PATH_BANGBOOS) == 1
    assert hoyolab.times_queried(PATH_SHIYU) == 1
    assert hoyolab.times_queried(PATH_LOST_VOID) == 0

    account = account_of(session)
    credential = account.credential
    assert credential is not None
    assert credential.rejected_at is not None

    assert account.nickname == ""
    assert account.level == 0
    assert account.chronicle_public is False
    assert account.chronicle_synced_at is None
    assert chronicle_service.list_agents(TRACKED_UID) == []
    assert chronicle_service.list_bangboos(TRACKED_UID) == []
    assert chronicle_service.list_challenge_runs(TRACKED_UID) == []
    assert stored_entries(session) == 0
    assert chronicle_service.find_lost_void(TRACKED_UID) is None


def test_cookies_that_expire_halfway_through_a_resync_leave_the_stored_history_as_it_was(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    chronicle_service.sync_chronicle(TRACKED_UID)
    hoyolab.serves_profile(chronicle_profile(nickname="Ghost Proxy", level=60))
    hoyolab.serves_shiyu(
        SCHEDULE_CURRENT,
        shiyu_season(
            CURRENT_SHIYU_SEASON,
            rating="S",
            score=20000,
            zone_names=("Reclaimed District",),
        ),
    )
    hoyolab.answers_with_retcode(RETCODE_INVALID_COOKIES, PATH_DEADLY_ASSAULT)

    # When
    with pytest.raises(InvalidCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID, force=True)

    # Then
    session.expire_all()
    account = account_of(session)
    credential = account.credential
    assert credential is not None
    assert credential.rejected_at is not None

    assert account.nickname == CHRONICLE_NICKNAME
    assert account.level == CHRONICLE_LEVEL
    assert seasons_of(chronicle_service, MODE_SHIYU_DEFENSE) == [
        CURRENT_SHIYU_SEASON,
        PREVIOUS_SHIYU_SEASON,
    ]
    kept = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_SHIYU_DEFENSE)[0]
    assert kept.rating == "S+"
    assert kept.score == 32450
    assert [entry.score for entry in kept.entries] == [16225, 16225]
    assert stored_entries(session) == 8
