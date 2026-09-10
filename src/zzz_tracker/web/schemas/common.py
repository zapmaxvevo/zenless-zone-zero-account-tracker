from __future__ import annotations

from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, Field

from zzz_tracker.discs.values import main_stat_total, substat_total
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.models import KNOWN_REGIONS

UID_PATTERN = r"^\d{6,16}$"

# In-game caps, used to keep hand-typed builds honest. Raise them when the game does.
MAX_LEVEL = 60
MAX_PROMOTION_LEVEL = 5
MAX_MINDSCAPE_LEVEL = 6
MAX_CORE_SKILL_ENHANCEMENT = 6
MAX_MODIFICATION_LEVEL = 5
MAX_PHASE = 5
MAX_RARITY = 5
MAX_DISC_LEVEL = 15
# Procs the disc receives -- Enka's BreakLevel -- not the roll count of one substat.
MAX_DISC_PROCS = 5
# A substat that exists on the disc was rolled at least once: zero rolls is not a substat.
MIN_SUBSTAT_ROLLS = 1


def _known_region(region: str) -> str:
    """Refuse a region HoYoLAB does not serve."""
    if region and region not in KNOWN_REGIONS:
        known = ", ".join(sorted(KNOWN_REGIONS))
        raise ValueError(f"{region!r} is not a HoYoLAB region; expected one of: {known}")
    return region


RegionField = Annotated[
    str,
    Field(
        description=(
            "HoYoLAB region of the account; empty to derive it from the UID. "
            f"One of: {', '.join(sorted(KNOWN_REGIONS))}."
        ),
    ),
    AfterValidator(_known_region),
]


class ErrorResponse(BaseModel):
    """Body of every error the tracker answers with; the codes live in `errors.py`."""

    detail: str
    code: str


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str


class StatRead(BaseModel):
    """A stat as Enka reports it, with the name, display format and in-game value resolved."""

    prop_id: int
    name: str | None
    format: str | None
    value: int
    rolls: int = 0
    total: int | None = None

    @classmethod
    def from_parts(
        cls, prop_id: int, value: int, rolls: int, total: int | None, static: StaticData | None
    ) -> StatRead:
        info = static.property(prop_id) if static else None
        return cls(
            prop_id=prop_id,
            name=info.name if info else None,
            format=info.format if info else None,
            value=value,
            rolls=rolls,
            total=total,
        )

    @classmethod
    def from_main_stat(
        cls, prop_id: int, value: int, rarity: int | None, level: int, static: StaticData | None
    ) -> StatRead:
        return cls.from_parts(
            prop_id=prop_id,
            value=value,
            rolls=0,
            total=main_stat_total(value, rarity, level),
            static=static,
        )

    @classmethod
    def from_substat(cls, raw: Any, static: StaticData | None) -> StatRead | None:
        if not isinstance(raw, dict) or not isinstance(raw.get("prop_id"), int):
            return None
        value = int(raw.get("value", 0))
        rolls = int(raw.get("rolls", 0))
        return cls.from_parts(
            prop_id=raw["prop_id"],
            value=value,
            rolls=rolls,
            total=substat_total(value, rolls),
            static=static,
        )
