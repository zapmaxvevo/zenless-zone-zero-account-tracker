from __future__ import annotations

import typer
import uvicorn

from zzz_tracker import __version__
from zzz_tracker.config import get_settings
from zzz_tracker.enka.static_data import STORE_BASE_URL, download_static_data
from zzz_tracker.storage.database import DatabaseManager

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


if __name__ == "__main__":
    app()
