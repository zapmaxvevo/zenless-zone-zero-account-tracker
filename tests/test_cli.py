from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import inspect
from typer.testing import CliRunner

from zzz_tracker import __version__
from zzz_tracker.cli import app
from zzz_tracker.config import get_settings
from zzz_tracker.storage.crypto import CredentialCipher
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.storage.keys import hash_key
from zzz_tracker.storage.models import (
    CLAIM_PROVISIONAL,
    Account,
    AccountKey,
    HoyolabCredential,
    utc_now,
)

FIRST_UID = "1300000001"
SECOND_UID = "1300000002"
THIRD_UID = "1300000003"
UNTRACKED_UID = "1300000404"

LTUID = "88112233"
LTOKEN = "v2_the_secret_cookie_that_must_never_be_printed"

CHRONICLE_TABLES = (
    "hoyolab_credentials",
    "challenge_runs",
    "challenge_run_entries",
    "bangboos",
    "lost_void_progress",
)


@dataclass
class CliEnvironment:
    database_url: str
    credentials_key: str

    def manager(self) -> DatabaseManager:
        return DatabaseManager(self.database_url)

    def cipher(self) -> CredentialCipher:
        return CredentialCipher(self.credentials_key)

    def create_schema(self) -> DatabaseManager:
        manager = self.manager()
        manager.create_all()
        return manager

    def table_names(self) -> list[str]:
        return list(inspect(self.manager().engine).get_table_names())

    def credential_of(self, uid: str) -> HoyolabCredential | None:
        with self.manager().session_factory() as session:
            account = session.get(Account, uid)
            assert account is not None
            return account.credential

    def key_of(self, uid: str) -> AccountKey | None:
        with self.manager().session_factory() as session:
            account = session.get(Account, uid)
            assert account is not None
            return account.key


@pytest.fixture
def cli_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[CliEnvironment]:
    environment = CliEnvironment(
        database_url=f"sqlite:///{tmp_path / 'cli.db'}",
        credentials_key=CredentialCipher.generate_key(),
    )
    monkeypatch.setenv("ZZZ_DATABASE_URL", environment.database_url)
    monkeypatch.setenv("ZZZ_CREDENTIALS_KEY", environment.credentials_key)
    monkeypatch.setenv("ZZZ_STATIC_DATA_DIR", str(tmp_path / "static"))
    monkeypatch.setenv("ZZZ_ENKA_BASE_URL", "https://enka.invalid/api/zzz")
    monkeypatch.setenv(
        "ZZZ_HOYOLAB_BASE_URL", "https://hoyolab.invalid/event/game_record_zzz/api/zzz"
    )
    get_settings.cache_clear()
    yield environment
    get_settings.cache_clear()


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


def naive_utc(moment: datetime) -> datetime:
    return moment.replace(tzinfo=None)


def add_account(
    manager: DatabaseManager,
    uid: str,
    credentials_key: str | None = None,
    rejected: bool = False,
    synced_ago: timedelta | None = None,
) -> None:
    with manager.session_factory() as session:
        account = Account(uid=uid, nickname=f"Proxy {uid}", level=55)
        if synced_ago is not None:
            account.chronicle_synced_at = naive_utc(utc_now() - synced_ago)
        if credentials_key is not None:
            account.credential = HoyolabCredential(
                account_uid=uid,
                ltuid_v2=LTUID,
                encrypted_ltoken=CredentialCipher(credentials_key).encrypt(LTOKEN),
                rejected_at=naive_utc(utc_now()) if rejected else None,
            )
        session.add(account)
        session.commit()


def test_version_prints_the_package_version(runner: CliRunner) -> None:
    result = runner.invoke(app, ["version"])

    assert result.exit_code == 0
    assert result.stdout.strip() == __version__


def test_new_credentials_key_prints_a_key_that_can_encrypt_and_decrypt(runner: CliRunner) -> None:
    result = runner.invoke(app, ["new-credentials-key"])

    assert result.exit_code == 0
    key = result.stdout.strip()
    cipher = CredentialCipher(key)
    assert cipher.decrypt(cipher.encrypt(LTOKEN)) == LTOKEN
    assert "ZZZ_CREDENTIALS_KEY" in result.stderr


def test_init_db_creates_the_schema_with_the_chronicle_tables(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    result = runner.invoke(app, ["init-db"])

    assert result.exit_code == 0
    assert cli_env.database_url in result.stdout
    tables = cli_env.table_names()
    assert "accounts" in tables
    for table in CHRONICLE_TABLES:
        assert table in tables


def test_set_credentials_stores_the_cookies_encrypted_without_printing_the_ltoken(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)

    result = runner.invoke(
        app, ["set-credentials", FIRST_UID, "--ltuid", LTUID, "--ltoken", LTOKEN]
    )

    assert result.exit_code == 0
    assert LTOKEN not in result.output
    assert f"{FIRST_UID}: HoYoLAB credentials stored" in result.stdout

    credential = cli_env.credential_of(FIRST_UID)
    assert credential is not None
    assert credential.ltuid_v2 == LTUID
    assert credential.encrypted_ltoken != LTOKEN
    assert cli_env.cipher().decrypt(credential.encrypted_ltoken) == LTOKEN


def test_set_credentials_asks_for_the_cookies_without_echoing_the_ltoken(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)

    result = runner.invoke(app, ["set-credentials", FIRST_UID], input=f"{LTUID}\n{LTOKEN}\n")

    assert result.exit_code == 0
    assert LTOKEN not in result.output

    credential = cli_env.credential_of(FIRST_UID)
    assert credential is not None
    assert credential.ltuid_v2 == LTUID
    assert cli_env.cipher().decrypt(credential.encrypted_ltoken) == LTOKEN


def test_set_credentials_on_an_account_that_is_not_tracked_fails_with_a_readable_message(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    cli_env.create_schema()

    result = runner.invoke(
        app, ["set-credentials", UNTRACKED_UID, "--ltuid", LTUID, "--ltoken", LTOKEN]
    )

    assert result.exit_code != 0
    assert f"{UNTRACKED_UID}: Account {UNTRACKED_UID} is not tracked yet" in result.stderr
    assert LTOKEN not in result.output


def test_claim_prints_a_key_that_owns_the_account_and_is_only_stored_hashed(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    """The way an account that predates account keys gets an owner again."""
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)

    result = runner.invoke(app, ["claim", FIRST_UID])

    assert result.exit_code == 0
    account_key = result.stdout.strip()
    assert account_key.startswith("zzk_")
    assert "only time" in result.stderr

    key = cli_env.key_of(FIRST_UID)
    assert key is not None
    assert key.claim_level == CLAIM_PROVISIONAL
    assert key.key_hash == hash_key(account_key)
    assert account_key not in key.key_hash


def test_claim_points_a_lost_key_at_rotate_key_and_not_at_an_import(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    """An import cannot take a claimed account back, so nothing may suggest that it can."""
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)

    result = runner.invoke(app, ["claim", FIRST_UID])

    assert result.exit_code == 0
    assert f"zzz-tracker rotate-key {FIRST_UID}" in result.stderr
    assert "an import cannot take a claimed account back" in result.stderr


def test_claim_of_an_account_that_already_has_an_owner_fails_without_printing_a_key(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)
    first = runner.invoke(app, ["claim", FIRST_UID]).stdout.strip()

    result = runner.invoke(app, ["claim", FIRST_UID])

    assert result.exit_code != 0
    assert FIRST_UID in result.stderr
    assert "zzk_" not in result.stdout
    key = cli_env.key_of(FIRST_UID)
    assert key is not None
    assert key.key_hash == hash_key(first)


def test_rotate_key_is_how_an_owner_who_lost_the_key_gets_back_in(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    """An import cannot take a claimed account over, so recovery costs access to the database."""
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)
    lost = runner.invoke(app, ["claim", FIRST_UID]).stdout.strip()

    result = runner.invoke(app, ["rotate-key", FIRST_UID])

    assert result.exit_code == 0
    recovered = result.stdout.strip()
    assert recovered.startswith("zzk_")
    assert recovered != lost
    assert "previous key stopped working" in result.stderr

    key = cli_env.key_of(FIRST_UID)
    assert key is not None
    assert key.key_hash == hash_key(recovered)
    assert key.key_hash != hash_key(lost)
    assert key.rotated_at is not None


def test_rotate_key_on_an_account_nobody_claimed_says_it_is_claiming_it(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)

    result = runner.invoke(app, ["rotate-key", FIRST_UID])

    assert result.exit_code == 0
    assert result.stdout.strip().startswith("zzk_")
    assert "had no key" in result.stderr


def test_rotate_key_on_an_account_that_is_not_tracked_fails_without_printing_a_key(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    cli_env.create_schema()

    result = runner.invoke(app, ["rotate-key", UNTRACKED_UID])

    assert result.exit_code != 0
    assert f"{UNTRACKED_UID}: Account {UNTRACKED_UID} is not tracked yet" in result.stderr
    assert "zzk_" not in result.stdout


def test_claim_of_an_account_that_is_not_tracked_fails_with_a_readable_message(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    cli_env.create_schema()

    result = runner.invoke(app, ["claim", UNTRACKED_UID])

    assert result.exit_code != 0
    assert f"{UNTRACKED_UID}: Account {UNTRACKED_UID} is not tracked yet" in result.stderr


def test_sync_chronicle_without_a_uid_walks_every_account_that_has_credentials(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    fresh = timedelta(minutes=1)
    add_account(manager, FIRST_UID, credentials_key=cli_env.credentials_key, synced_ago=fresh)
    add_account(manager, SECOND_UID, credentials_key=cli_env.credentials_key, synced_ago=fresh)
    add_account(manager, THIRD_UID, synced_ago=fresh)

    result = runner.invoke(app, ["sync-chronicle"])

    assert result.exit_code == 0
    assert f"{FIRST_UID}: still fresh, skipped" in result.stdout
    assert f"{SECOND_UID}: still fresh, skipped" in result.stdout
    assert THIRD_UID not in result.output


def test_sync_chronicle_with_a_uid_only_touches_that_account(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    fresh = timedelta(minutes=1)
    add_account(manager, FIRST_UID, credentials_key=cli_env.credentials_key, synced_ago=fresh)
    add_account(manager, SECOND_UID, credentials_key=cli_env.credentials_key, synced_ago=fresh)

    result = runner.invoke(app, ["sync-chronicle", FIRST_UID])

    assert result.exit_code == 0
    assert f"{FIRST_UID}: still fresh, skipped" in result.stdout
    assert SECOND_UID not in result.output


def test_sync_chronicle_without_any_credentialed_account_says_so_without_failing(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID)

    result = runner.invoke(app, ["sync-chronicle"])

    assert result.exit_code == 0
    assert "no tracked account has HoYoLAB credentials stored" in result.stderr


def test_sync_chronicle_keeps_going_after_an_account_fails_and_exits_with_an_error(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID, credentials_key=CredentialCipher.generate_key())
    add_account(
        manager,
        SECOND_UID,
        credentials_key=cli_env.credentials_key,
        synced_ago=timedelta(minutes=1),
    )

    result = runner.invoke(app, ["sync-chronicle"])

    assert result.exit_code == 1
    assert f"{FIRST_UID}: Stored credentials could not be decrypted" in result.stderr
    assert f"{SECOND_UID}: still fresh, skipped" in result.stdout
    assert f"1 account(s) failed: {FIRST_UID}" in result.stderr


def test_sync_chronicle_without_a_uid_skips_the_accounts_hoyolab_already_rejected(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID, credentials_key=cli_env.credentials_key, rejected=True)
    add_account(
        manager,
        SECOND_UID,
        credentials_key=cli_env.credentials_key,
        synced_ago=timedelta(minutes=1),
    )

    result = runner.invoke(app, ["sync-chronicle"])

    assert result.exit_code == 0
    assert f"{FIRST_UID}: skipped, HoYoLAB rejected its cookies" in result.stderr
    assert f"set-credentials {FIRST_UID}" in result.stderr
    assert f"{SECOND_UID}: still fresh, skipped" in result.stdout
    assert "failed" not in result.output


def test_sync_chronicle_with_every_account_rejected_asks_for_new_cookies_without_failing(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID, credentials_key=cli_env.credentials_key, rejected=True)

    result = runner.invoke(app, ["sync-chronicle"])

    assert result.exit_code == 0
    assert f"{FIRST_UID}: skipped, HoYoLAB rejected its cookies" in result.stderr
    assert "no tracked account has HoYoLAB credentials stored" not in result.stderr
    assert "failed" not in result.output


def test_sync_chronicle_asked_for_a_rejected_uid_by_name_still_tries_it_and_fails(
    runner: CliRunner, cli_env: CliEnvironment
) -> None:
    manager = cli_env.create_schema()
    add_account(manager, FIRST_UID, credentials_key=cli_env.credentials_key, rejected=True)

    result = runner.invoke(app, ["sync-chronicle", FIRST_UID])

    assert result.exit_code == 1
    assert f"The cookies stored for {FIRST_UID} were rejected" in result.stderr
    assert f"1 account(s) failed: {FIRST_UID}" in result.stderr
