"""Lost Void progress, the one chronicle section that is a scoreboard rather than a run."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from zzz_tracker.parsing import as_dict, as_int, as_str, first_present


@dataclass(frozen=True, slots=True)
class ParsedLostVoid:
    license_level: int
    exploration_log: int
    max_exploration_log: int
    commissions_done: int
    commissions_total: int
    ultimate_challenge_score: int
    ultimate_challenge_tier: str
    data_collected: int
    raw: dict[str, Any]


def _current_and_maximum(raw: Any, fallback_maximum: Any) -> tuple[int, int]:
    if isinstance(raw, dict):
        return (
            as_int(first_present(raw, "cur", "current", "done", "value", "num")),
            as_int(first_present(raw, "max", "total")),
        )
    return as_int(raw), as_int(fallback_maximum)


def _nested_int(raw: Any, *keys: str) -> int:
    if isinstance(raw, dict):
        return as_int(first_present(raw, *keys))
    return as_int(raw)


def _ultimate_challenge(payload: dict[str, Any]) -> tuple[int, str]:
    raw = first_present(payload, "ultimate_challenge", "ultimate")
    if isinstance(raw, dict):
        return (
            _nested_int(raw, "score", "value"),
            as_str(first_present(raw, "tier", "rank", "name")),
        )
    return (
        as_int(payload.get("ultimate_challenge_score")),
        as_str(first_present(payload, "ultimate_challenge_tier", "ultimate_tier")),
    )


def parse_lost_void(data: dict[str, Any]) -> ParsedLostVoid | None:
    payload = as_dict(data)
    if not payload:
        return None

    exploration, max_exploration = _current_and_maximum(
        first_present(payload, "exploration_log", "explore_log"),
        first_present(payload, "max_exploration_log", "exploration_log_max"),
    )
    commissions_done, commissions_total = _current_and_maximum(
        first_present(payload, "commission_progress", "commissions", "commission"),
        first_present(payload, "commissions_total", "commission_total"),
    )
    ultimate_score, ultimate_tier = _ultimate_challenge(payload)

    return ParsedLostVoid(
        license_level=_nested_int(
            first_present(payload, "license_level", "license"), "level", "cur", "value"
        ),
        exploration_log=exploration,
        max_exploration_log=max_exploration,
        commissions_done=commissions_done or as_int(payload.get("commissions_done")),
        commissions_total=commissions_total,
        ultimate_challenge_score=ultimate_score,
        ultimate_challenge_tier=ultimate_tier,
        data_collected=_nested_int(
            first_present(payload, "data_collected", "collected_data", "data_num"),
            "cur",
            "num",
            "count",
            "value",
        ),
        raw=payload,
    )
