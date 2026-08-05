from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from zzz_tracker import __version__
from zzz_tracker.config import Settings, get_settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import register_exception_handlers
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.web.routers.accounts import router as accounts_router
from zzz_tracker.web.routers.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    try:
        yield
    finally:
        enka: EnkaClient = app.state.enka
        enka.close()


def create_app(
    settings: Settings | None = None,
    enka: EnkaClient | None = None,
    static: StaticData | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app = FastAPI(title=app_settings.app_name, version=__version__, lifespan=lifespan)
    app.state.settings = app_settings
    app.state.db = DatabaseManager(app_settings.database_url)
    app.state.enka = enka or EnkaClient(base_url=app_settings.enka_base_url)
    app.state.static = static or StaticData.load_optional(app_settings.static_data_dir)

    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(accounts_router)
    return app


app = create_app()
