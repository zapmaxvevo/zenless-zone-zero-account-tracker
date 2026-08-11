from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import CaptchaRequiredError, InvalidCredentialsError, RateLimitedError
from zzz_tracker.hoyolab.client import SCHEDULE_CURRENT, SCHEDULE_PREVIOUS, HoyolabClient
from zzz_tracker.storage.crypto import CredentialCipher
from zzz_tracker.storage.models import MODE_SHIYU_DEFENSE, Account
from zzz_tracker.tracker.service import TrackerService

from .conftest import (
    CURRENT_SHIYU_SEASON,
    PATH_LOST_VOID,
    PATH_PROFILE,
    PATH_SHIYU,
    PREVIOUS_SHIYU_SEASON,
    TRACKED_UID,
    FakeHoyolab,
    shiyu_season,
)

LTUID = "81002000"
LTOKEN = "v2_the-secret-cookie"

RETCODE_CAPTCHA = 1034
RETCODE_RATE_LIMITED = 10101
RETCODE_OK = 0


@pytest.fixture
def eager_chronicle_service(
    session: Session,
    enka_client: EnkaClient,
    static_data: StaticData,
    hoyolab_client: HoyolabClient,
    cipher: CredentialCipher,
) -> TrackerService:
    return TrackerService(
        session=session,
        enka=enka_client,
        static=static_data,
        hoyolab=hoyolab_client,
        cipher=cipher,
        chronicle_ttl_seconds=0,
    )


def account_with_cookies(service: TrackerService, session: Session) -> Account:
    account = Account(uid=TRACKED_UID)
    session.add(account)
    session.commit()
    service.store_credentials(TRACKED_UID, LTUID, LTOKEN)
    return account


def account_of(session: Session) -> Account:
    account = session.get(Account, TRACKED_UID)
    assert account is not None
    return account


def seasons_of(service: TrackerService, mode: str) -> list[int]:
    return [run.schedule_id for run in service.list_challenge_runs(TRACKED_UID, mode)]


def test_a_captcha_stops_the_tracker_from_knocking_on_hoyolab_again_until_it_is_forced(
    eager_chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(eager_chronicle_service, session)
    hoyolab.answers_with_retcode(RETCODE_CAPTCHA)

    # When
    with pytest.raises(CaptchaRequiredError):
        eager_chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    account = account_of(session)
    assert account.chronicle_failed_at is not None
    assert account.chronicle_synced_at is None

    hoyolab.forget_what_was_asked()
    report = eager_chronicle_service.sync_chronicle(TRACKED_UID)
    assert report.skipped is True
    assert report.runs == ()
    assert hoyolab.was_queried() is False

    with pytest.raises(CaptchaRequiredError):
        eager_chronicle_service.sync_chronicle(TRACKED_UID, force=True)
    assert hoyolab.times_queried(PATH_PROFILE) == 1


def test_a_rate_limit_stops_the_tracker_from_knocking_on_hoyolab_again_until_it_is_forced(
    eager_chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(eager_chronicle_service, session)
    hoyolab.answers_with_retcode(RETCODE_RATE_LIMITED)

    # When
    with pytest.raises(RateLimitedError):
        eager_chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    account = account_of(session)
    assert account.chronicle_failed_at is not None
    assert account.chronicle_synced_at is None

    hoyolab.forget_what_was_asked()
    report = eager_chronicle_service.sync_chronicle(TRACKED_UID)
    assert report.skipped is True
    assert hoyolab.was_queried() is False

    with pytest.raises(RateLimitedError):
        eager_chronicle_service.sync_chronicle(TRACKED_UID, force=True)
    assert hoyolab.times_queried(PATH_PROFILE) == 1


def test_a_sync_that_finally_goes_through_lifts_the_backoff_the_failure_had_imposed(
    eager_chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(eager_chronicle_service, session)
    hoyolab.answers_with_retcode(RETCODE_CAPTCHA, PATH_LOST_VOID)
    with pytest.raises(CaptchaRequiredError):
        eager_chronicle_service.sync_chronicle(TRACKED_UID)
    hoyolab.answers_with_retcode(RETCODE_OK, PATH_LOST_VOID)

    # When
    report = eager_chronicle_service.sync_chronicle(TRACKED_UID, force=True)

    # Then
    session.expire_all()
    assert report.skipped is False
    account = account_of(session)
    assert account.chronicle_failed_at is None
    assert account.chronicle_synced_at is not None
    assert seasons_of(eager_chronicle_service, MODE_SHIYU_DEFENSE) == [
        CURRENT_SHIYU_SEASON,
        PREVIOUS_SHIYU_SEASON,
    ]

    hoyolab.forget_what_was_asked()
    resynced = eager_chronicle_service.sync_chronicle(TRACKED_UID)
    assert resynced.skipped is False
    assert hoyolab.times_queried(PATH_PROFILE) == 1


def test_a_season_served_as_both_the_current_and_the_previous_one_is_stored_once_as_the_current(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    hoyolab.serves_shiyu(SCHEDULE_CURRENT, shiyu_season(CURRENT_SHIYU_SEASON))
    hoyolab.serves_shiyu(
        SCHEDULE_PREVIOUS,
        shiyu_season(
            CURRENT_SHIYU_SEASON,
            rating="S",
            score=28000,
            zone_names=("Reclaimed District",),
        ),
    )

    # When
    report = chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    assert hoyolab.times_queried(PATH_SHIYU) == 2
    assert [run.schedule_id for run in report.runs if run.mode == MODE_SHIYU_DEFENSE] == [
        CURRENT_SHIYU_SEASON
    ]
    assert seasons_of(chronicle_service, MODE_SHIYU_DEFENSE) == [CURRENT_SHIYU_SEASON]

    stored = chronicle_service.list_challenge_runs(TRACKED_UID, MODE_SHIYU_DEFENSE)[0]
    assert stored.rating == "S+"
    assert stored.score == 32450
    assert [(entry.position, entry.score) for entry in stored.entries] == [(1, 16225), (2, 16225)]


def test_a_second_rejection_keeps_the_date_the_cookies_were_first_refused(
    chronicle_service: TrackerService, session: Session, hoyolab: FakeHoyolab
) -> None:
    # Given
    account_with_cookies(chronicle_service, session)
    hoyolab.rejects_the_cookies()
    with pytest.raises(InvalidCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID)
    session.expire_all()
    first_credential = account_of(session).credential
    assert first_credential is not None
    first_rejection = first_credential.rejected_at
    assert first_rejection is not None
    hoyolab.forget_what_was_asked()

    # When
    with pytest.raises(InvalidCredentialsError):
        chronicle_service.sync_chronicle(TRACKED_UID)

    # Then
    session.expire_all()
    credential = account_of(session).credential
    assert credential is not None
    assert credential.rejected_at == first_rejection
    assert hoyolab.was_queried() is False
