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
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.storage.keys import hash_key
from zzz_tracker.storage.models import Account, AccountKey, utc_now

FIRST_UID = "1300000001"
SECOND_UID = "1300000002"
THIRD_UID = "1300000003"
UNTRACKED_UID = "1300000404"

CHRONICLE_TABLES = (
    "account_keys",
    "challenge_runs",
    "challenge_run_entries",
    "bangboos",
    "lost_void_progress",
)


@dataclass
class CliEnvironment:
    database_url: str

    def manager(self) -> DatabaseManager:
        return DatabaseManager(self.database_url)

    def create_schema(self) -> DatabaseManager:
        manager = self.manager()
        manager.create_all()
        return manager

    def table_names(self) -> list[str]:
        return list(inspect(self.manager().engine).get_table_names())

    def key_of(self, uid: str) -> AccountKey | None:
        with self.manager().session_factory() as session:
            account = session.get(Account, uid)
            assert account is not None
            return account.key


@pytest.fixture
def cli_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[CliEnvironment]:
    environment = CliEnvironment(database_url=f"sqlite:///{tmp_path / 'cli.db'}")
    monkeypatch.setenv("ZZZ_DATABASE_URL", environment.database_url)
    monkeypatch.setenv("ZZZ_STATIC_DATA_DIR", str(tmp_path / "static"))
    monkeypatch.setenv("ZZZ_ENKA_BASE_URL", "https://enka.invalid/api/zzz")
    get_settings.cache_clear()
    yield environment
    get_settings.cache_clear()


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


def naive_utc(moment: datetime) -> datetime:
    return moment.replace(tzinfo=None)


def add_account(manager: DatabaseManager, uid: str, synced_ago: timedelta | None = None) -> None:
    with manager.session_factory() as session:
        account = Account(uid=uid, nickname=f"Proxy {uid}", level=55)
        if synced_ago is not None:
            account.chronicle_synced_at = naive_utc(utc_now() - synced_ago)
        session.add(account)
        session.commit()


def test_version_prints_the_package_version(runner: CliRunner) -> None:
    result = runner.invoke(app, ["version"])

    assert result.exit_code == 0
    assert result.stdout.strip() == __version__


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
