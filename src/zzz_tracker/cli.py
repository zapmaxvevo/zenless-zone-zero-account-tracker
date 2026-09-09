from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import typer
import uvicorn

from zzz_tracker import __version__
from zzz_tracker.config import Settings, get_settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import STORE_BASE_URL, StaticData, download_static_data
from zzz_tracker.errors import ZZZTrackerError
from zzz_tracker.hoyolab.client import HoyolabClient
from zzz_tracker.storage.crypto import CredentialCipher
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.storage.models import CLAIM_UNCLAIMED
from zzz_tracker.tracker.service import ChronicleSyncReport, TrackerService

app = typer.Typer(help="ZZZ Tracker command line entrypoint.")


@app.command()
def version() -> None:
    typer.echo(__version__)


@app.command()
def serve(
    host: str = "127.0.0.1",
    port: int = 8000,
    reload: bool = False,
) -> None:
    """Run the API server."""
    uvicorn.run(
        "zzz_tracker.app:app",
        host=host,
        port=port,
        reload=reload,
    )


@app.command("sync-static")
def sync_static(
    directory: str = "",
    base_url: str = STORE_BASE_URL,
) -> None:
    """Download Enka's static store files used to resolve ids into names and icons."""
    settings = get_settings()
    target = directory or settings.static_data_dir
    written = download_static_data(target, base_url=base_url)
    for path in written:
        typer.echo(f"wrote {path}")
    typer.echo(f"{len(written)} files synced into {target}")


@app.command("init-db")
def init_db() -> None:
    """Create any missing tables directly, for local development without Alembic."""
    settings = get_settings()
    DatabaseManager(settings.database_url).create_all()
    typer.echo(f"schema created in {settings.database_url}")


@contextmanager
def tracker_service(settings: Settings) -> Iterator[TrackerService]:
    manager = DatabaseManager(settings.database_url)
    cipher = CredentialCipher(settings.credentials_key) if settings.credentials_key else None
    static = StaticData.load_optional(settings.static_data_dir)
    enka = EnkaClient(base_url=settings.enka_base_url)
    hoyolab = HoyolabClient(
        base_url=settings.hoyolab_base_url,
        language=settings.hoyolab_language,
    )
    try:
        with manager.session_factory() as session:
            yield TrackerService(
                session,
                enka,
                static=static,
                hoyolab=hoyolab,
                cipher=cipher,
                chronicle_ttl_seconds=settings.hoyolab_sync_ttl_seconds,
                chronicle_backoff_seconds=settings.hoyolab_backoff_seconds,
            )
    finally:
        enka.close()
        hoyolab.close()


@app.command(
    "new-credentials-key",
    help="Generate the Fernet key used to encrypt the HoYoLAB cookies kept in the database.",
)
def new_credentials_key() -> None:
    typer.echo(CredentialCipher.generate_key())
    typer.echo(
        "Store that key as ZZZ_CREDENTIALS_KEY, in .env or in the deployment environment. "
        "Changing it makes every credential already stored unreadable.",
        err=True,
    )


@app.command(
    "set-credentials",
    help="Store the HoYoLAB cookies of a tracked account, encrypted with ZZZ_CREDENTIALS_KEY.",
)
def set_credentials(
    uid: str = typer.Argument(..., help="UID of the account the cookies belong to."),
    ltuid: str = typer.Option("", "--ltuid", help="The ltuid_v2 cookie; asked for when omitted."),
    ltoken: str = typer.Option(
        "",
        "--ltoken",
        help="The ltoken_v2 cookie; asked for without echoing it when omitted, "
        "which keeps it out of the shell history.",
    ),
) -> None:
    ltuid_v2 = ltuid.strip() or str(typer.prompt("ltuid_v2")).strip()
    ltoken_v2 = ltoken.strip() or str(typer.prompt("ltoken_v2", hide_input=True)).strip()

    settings = get_settings()
    try:
        with tracker_service(settings) as service:
            service.store_credentials(uid, ltuid_v2, ltoken_v2)
    except ZZZTrackerError as error:
        typer.echo(f"{uid}: {error.detail}", err=True)
        raise typer.Exit(code=1) from error
    typer.echo(f"{uid}: HoYoLAB credentials stored")


@app.command(
    "claim",
    help="Claim a tracked account and print its key, the secret every write to it needs. "
    "Meant for accounts that predate account keys; the web claims new ones by itself. "
    "It refuses an account that already has an owner — to replace the key of one of those, "
    "use `rotate-key`.",
)
def claim(
    uid: str = typer.Argument(..., help="UID of the account to take ownership of."),
) -> None:
    settings = get_settings()
    try:
        with tracker_service(settings) as service:
            account_key = service.claim_account(uid)
    except ZZZTrackerError as error:
        typer.echo(f"{uid}: {error.detail}", err=True)
        raise typer.Exit(code=1) from error
    typer.echo(account_key)
    typer.echo(
        f"That is the only time {uid}'s key can be read. Store it; whoever holds it can "
        f"write to the account, and losing it takes `zzz-tracker rotate-key {uid}` here to "
        "recover — an import cannot take a claimed account back.",
        err=True,
    )


@app.command(
    "rotate-key",
    help="Issue a new key for an account and invalidate the one it had. This is how the "
    "owner of an account gets back in after losing their key: an import cannot take over "
    "an account that was already claimed, so recovery deliberately costs access to the "
    "database. Whoever runs this becomes the owner, so run it only for the real one.",
)
def rotate_key(
    uid: str = typer.Argument(..., help="UID of the account to issue a new key for."),
) -> None:
    settings = get_settings()
    try:
        with tracker_service(settings) as service:
            had_key = service.get_account(uid).claim_level != CLAIM_UNCLAIMED
            account_key = service.rotate_key(uid)
    except ZZZTrackerError as error:
        typer.echo(f"{uid}: {error.detail}", err=True)
        raise typer.Exit(code=1) from error

    typer.echo(account_key)
    if had_key:
        typer.echo(
            f"{uid}: the previous key stopped working right now — anything still using it "
            "(a browser, the extension on another machine) has to be given this one.",
            err=True,
        )
    else:
        typer.echo(f"{uid}: the account had no key; this one claims it.", err=True)
    typer.echo(
        "This is the only time it can be read; it is stored hashed.",
        err=True,
    )


@app.command(
    "sync-chronicle",
    help="Read the Battle Chronicle of an account, or of every account with stored "
    "credentials when no UID is given, which is the mode meant for the cron.",
)
def sync_chronicle(
    uid: str = typer.Argument("", help="Account to sync; all of them when omitted."),
    force: bool = typer.Option(
        False, "--force", help="Sync even when the last read is still within its ttl."
    ),
    no_previous: bool = typer.Option(
        False, "--no-previous", help="Read only the running season, skipping the previous one."
    ),
) -> None:
    settings = get_settings()
    failed: list[str] = []

    with tracker_service(settings) as service:
        if uid:
            targets = [uid]
        else:
            targets = syncable_uids(service)
            if not targets:
                return
        for target in targets:
            try:
                report = service.sync_chronicle(
                    target, force=force, include_previous=not no_previous
                )
            except ZZZTrackerError as error:
                failed.append(target)
                typer.echo(f"{target}: {error.detail}", err=True)
                continue
            echo_report(report)

    if failed:
        typer.echo(f"{len(failed)} account(s) failed: {', '.join(failed)}", err=True)
        raise typer.Exit(code=1)


def syncable_uids(service: TrackerService) -> list[str]:
    usable: list[str] = []
    rejected: list[str] = []
    for account in service.list_accounts():
        credential = account.credential
        if credential is None:
            continue
        if credential.is_rejected:
            rejected.append(account.uid)
        else:
            usable.append(account.uid)

    for stale in rejected:
        typer.echo(
            f"{stale}: skipped, HoYoLAB rejected its cookies; "
            f"renew them with `zzz-tracker set-credentials {stale}`",
            err=True,
        )
    if not usable and not rejected:
        typer.echo("no tracked account has HoYoLAB credentials stored", err=True)
    return usable


def echo_report(report: ChronicleSyncReport) -> None:
    uid = report.account.uid
    if report.skipped:
        typer.echo(f"{uid}: still fresh, skipped; pass --force to sync anyway")
        return

    typer.echo(f"{uid}: {report.agents_synced} agents, {report.bangboos_synced} bangboos")
    for run in report.runs:
        typer.echo(
            f"  {run.mode} season {run.schedule_id}: "
            f"rating {run.rating or '-'}, score {run.score}/{run.max_score}, "
            f"{run.total_stars} stars"
        )
    if report.lost_void_synced:
        typer.echo("  lost void progress saved")
    if report.unavailable_modes:
        typer.echo(f"  no season data yet for: {', '.join(report.unavailable_modes)}")


if __name__ == "__main__":
    app()
