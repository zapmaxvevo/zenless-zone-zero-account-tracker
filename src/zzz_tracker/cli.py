from __future__ import annotations

import typer
import uvicorn

from zzz_tracker import __version__

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


if __name__ == "__main__":
    app()
