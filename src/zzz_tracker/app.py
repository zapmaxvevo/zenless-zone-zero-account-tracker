from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from zzz_tracker import __version__
from zzz_tracker.config import Settings, get_settings
from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import register_exception_handlers
from zzz_tracker.hoyolab.client import HoyolabClient
from zzz_tracker.storage.crypto import CredentialCipher
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.web.routers.accounts import router as accounts_router
from zzz_tracker.web.routers.agents import router as agents_router
from zzz_tracker.web.routers.catalog import router as catalog_router
from zzz_tracker.web.routers.chronicle import router as chronicle_router
from zzz_tracker.web.routers.health import router as health_router
from zzz_tracker.web.routers.teams import router as teams_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    try:
        yield
    finally:
        enka: EnkaClient = app.state.enka
        enka.close()
        hoyolab: HoyolabClient = app.state.hoyolab
        hoyolab.close()


def create_app(
    settings: Settings | None = None,
    enka: EnkaClient | None = None,
    static: StaticData | None = None,
    hoyolab: HoyolabClient | None = None,
    cipher: CredentialCipher | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app = FastAPI(title=app_settings.app_name, version=__version__, lifespan=lifespan)
    app.state.settings = app_settings
    app.state.db = DatabaseManager(app_settings.database_url)
    app.state.enka = enka or EnkaClient(base_url=app_settings.enka_base_url)
    app.state.static = static or StaticData.load_optional(app_settings.static_data_dir)
    app.state.hoyolab = hoyolab or HoyolabClient(
        base_url=app_settings.hoyolab_base_url,
        language=app_settings.hoyolab_language,
    )
    app.state.cipher = cipher or _optional_cipher(app_settings.credentials_key)

    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(accounts_router)
    app.include_router(agents_router)
    app.include_router(teams_router)
    app.include_router(catalog_router)
    app.include_router(chronicle_router)
    return app


def _optional_cipher(key: str) -> CredentialCipher | None:
    return CredentialCipher(key) if key else None


app = create_app()
