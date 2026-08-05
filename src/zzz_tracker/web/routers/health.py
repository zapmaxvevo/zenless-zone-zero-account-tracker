from __future__ import annotations

from fastapi import APIRouter

from zzz_tracker import __version__
from zzz_tracker.web.deps import SettingsDep
from zzz_tracker.web.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health")
def get_health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="ok", app=settings.app_name, version=__version__)
