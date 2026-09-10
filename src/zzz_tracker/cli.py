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
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.tracker.service import TrackerService

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
    static = StaticData.load_optional(settings.static_data_dir)
    enka = EnkaClient(base_url=settings.enka_base_url)
    try:
        with manager.session_factory() as session:
            yield TrackerService(session, enka, static=static)
    finally:
        enka.close()


@app.command(
    "claim",
    help="Claim a tracked account and print its key, the secret every write to it needs. "
    "Claiming is normally the browser extension's job: importing an account's chronicle is "
    "what takes ownership of it. This is the way in for the accounts that predate account "
    "keys, and for an owner who cannot run the extension. It refuses an account that "
    "already has an owner — to replace the key of one of those, use `rotate-key`.",
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
            had_key = service.get_account(uid).is_claimed
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


if __name__ == "__main__":
    app()
