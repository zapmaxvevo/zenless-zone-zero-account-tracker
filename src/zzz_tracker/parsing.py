"""Coercions for payloads nobody guarantees: every reader here answers, none of them raises."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def as_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return default


def as_optional_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None


def as_str(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bool) or value is None:
        return ""
    if isinstance(value, int):
        return str(value)
    return ""


def first_present(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return None


def first_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    for item in as_list(value):
        if isinstance(item, dict):
            return item
    return {}


def timestamp_to_datetime(value: Any) -> datetime | None:
    """A UTC datetime from a Unix timestamp; `None` for zero, which means "never"."""
    seconds = as_optional_int(value)
    if not seconds:
        return None
    try:
        return datetime.fromtimestamp(seconds, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None
