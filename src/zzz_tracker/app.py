from __future__ import annotations

from fastapi import FastAPI

from zzz_tracker import __version__
from zzz_tracker.config import Settings, get_settings
from zzz_tracker.errors import register_exception_handlers
from zzz_tracker.storage.database import DatabaseManager
from zzz_tracker.web.routers.health import router as health_router


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    app = FastAPI(title=app_settings.app_name, version=__version__)
    app.state.settings = app_settings
    app.state.db = DatabaseManager(app_settings.database_url)

    register_exception_handlers(app)
    app.include_router(health_router)
    return app


app = create_app()
