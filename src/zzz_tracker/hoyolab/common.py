"""The vocabulary the HoYoLAB payloads share across sections: rarity letters, dates, icons."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from zzz_tracker.parsing import as_int, as_optional_int, timestamp_to_datetime

RARITY_BY_LETTER = {"B": 2, "A": 3, "S": 4}
AGENT_ICON_KEYS = ("role_square_url", "square_icon", "avatar_icon", "icon", "vertical_painting_url")


def _datetime_from_parts(parts: dict[str, Any]) -> datetime | None:
    year = as_optional_int(parts.get("year"))
    month = as_optional_int(parts.get("month"))
    day = as_optional_int(parts.get("day"))
    if year is None or month is None or day is None:
        return None
    try:
        return datetime(
            year,
            month,
            day,
            as_int(parts.get("hour")),
            as_int(parts.get("minute")),
            as_int(parts.get("second")),
            tzinfo=UTC,
        )
    except ValueError:
        return None


def to_datetime(value: Any) -> datetime | None:
    if isinstance(value, dict):
        return _datetime_from_parts(value)
    return timestamp_to_datetime(value)


def rarity_number(value: Any) -> int | None:
    if isinstance(value, str):
        return RARITY_BY_LETTER.get(value.strip().upper())
    return as_optional_int(value)
