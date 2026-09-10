"""Shiyu Defense (both schemas) and Deadly Assault, read into one shared run shape."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from zzz_tracker.hoyolab.common import AGENT_ICON_KEYS, to_datetime
from zzz_tracker.parsing import (
    as_dict,
    as_int,
    as_list,
    as_optional_int,
    as_str,
    first_dict,
    first_present,
)
from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE

SCHEMA_V1 = "v1"
SCHEMA_V2 = "v2"

RATING_ORDER = ("B", "A", "S", "S+")
RATING_STARS = {"B": 1, "A": 2, "S": 3, "S+": 3}

LAYER_DETAIL_SUFFIX = "_layer_detail"
# HoYoLAB itself misspells the fifth layer as `fitfh_layer_detail`; both spellings are read.
LAYER_ORDINALS: tuple[tuple[str, ...], ...] = (
    ("first",),
    ("second",),
    ("third",),
    ("fourth",),
    ("fitfh", "fifth"),
    ("sixth",),
    ("seventh",),
)


@dataclass(frozen=True, slots=True)
class ParsedChallengeAgent:
    game_id: int
    level: int
    rarity: str
    element: str
    mindscape: int
    icon: str

    def as_snapshot(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "level": self.level,
            "rarity": self.rarity,
            "element": self.element,
            "mindscape": self.mindscape,
            "icon": self.icon,
        }


@dataclass(frozen=True, slots=True)
class ParsedChallengeEntry:
    position: int
    name: str
    rating: str
    score: int
    max_score: int
    stars: int
    clear_time_seconds: int | None
    challenged_at: datetime | None
    boss_name: str
    boss_icon: str
    buffs: tuple[dict[str, str], ...]
    agents: tuple[ParsedChallengeAgent, ...]
    bangboo_id: int | None
    layer_index: int | None = None
    layer_id: int | None = None


@dataclass(frozen=True, slots=True)
class ParsedChallengeRun:
    mode: str
    schedule_id: int
    begin_time: datetime | None
    end_time: datetime | None
    has_data: bool
    rating: str
    score: int
    max_score: int
    total_stars: int
    rank_percent: int | None
    clear_time_seconds: int | None
    schema_version: str
    entries: tuple[ParsedChallengeEntry, ...]
    raw: dict[str, Any]


def _best_rating(candidates: Iterable[str]) -> str:
    best = ""
    for candidate in candidates:
        if candidate not in RATING_ORDER:
            continue
        if best == "" or RATING_ORDER.index(candidate) > RATING_ORDER.index(best):
            best = candidate
    return best


def _stars_for(rating: str) -> int:
    return RATING_STARS.get(rating.upper(), 0)


def _parse_buffs(raw: Any) -> tuple[dict[str, str], ...]:
    items = [raw] if isinstance(raw, dict) else as_list(raw)
    buffs: list[dict[str, str]] = []
    for item in items:
        data = as_dict(item)
        title = as_str(first_present(data, "title", "name"))
        text = as_str(first_present(data, "text", "desc", "description"))
        if not title and not text:
            continue
        buffs.append({"title": title, "text": text, "icon": as_str(data.get("icon"))})
    return tuple(buffs)


def _parse_challenge_agent(raw: Any) -> ParsedChallengeAgent | None:
    data = as_dict(raw)
    game_id = as_optional_int(data.get("id"))
    if game_id is None:
        return None
    return ParsedChallengeAgent(
        game_id=game_id,
        level=as_int(data.get("level"), 1),
        rarity=as_str(data.get("rarity")),
        element=as_str(first_present(data, "element_type", "element")),
        mindscape=as_int(first_present(data, "rank", "mindscape", "talent_level")),
        icon=as_str(first_present(data, *AGENT_ICON_KEYS)),
    )


def _parse_challenge_agents(*raws: Any) -> tuple[ParsedChallengeAgent, ...]:
    agents: list[ParsedChallengeAgent] = []
    seen: set[int] = set()
    for raw in raws:
        for item in as_list(raw):
            agent = _parse_challenge_agent(item)
            if agent is None or agent.game_id in seen:
                continue
            seen.add(agent.game_id)
            agents.append(agent)
    return tuple(agents)


def _first_bangboo_id(*raws: Any) -> int | None:
    for raw in raws:
        bangboo_id = as_optional_int(as_dict(raw).get("id"))
        if bangboo_id is not None:
            return bangboo_id
    return None


def _has_data(section: dict[str, Any], entries: tuple[ParsedChallengeEntry, ...]) -> bool:
    flagged = section.get("has_data")
    if isinstance(flagged, bool):
        return flagged
    return bool(entries)


def _parse_shiyu_v1_entry(position: int, raw: Any) -> ParsedChallengeEntry:
    floor = as_dict(raw)
    first_node = as_dict(floor.get("node_1"))
    second_node = as_dict(floor.get("node_2"))
    rating = as_str(floor.get("rating")).upper()
    battle_times = [
        seconds
        for seconds in (
            as_optional_int(first_node.get("battle_time")),
            as_optional_int(second_node.get("battle_time")),
        )
        if seconds is not None
    ]
    return ParsedChallengeEntry(
        position=position,
        name=as_str(first_present(floor, "zone_name", "layer_name", "name")),
        rating=rating,
        score=as_int(floor.get("score")),
        max_score=as_int(floor.get("max_score")),
        stars=_stars_for(rating),
        clear_time_seconds=sum(battle_times) if battle_times else None,
        challenged_at=to_datetime(first_present(floor, "floor_challenge_time", "challenge_time")),
        boss_name="",
        boss_icon="",
        buffs=_parse_buffs(first_present(floor, "buffs", "buffer")),
        agents=_parse_challenge_agents(first_node.get("avatars"), second_node.get("avatars")),
        bangboo_id=_first_bangboo_id(first_node.get("buddy"), second_node.get("buddy")),
        layer_index=as_optional_int(first_present(floor, "layer_index", "floor_index")),
        layer_id=as_optional_int(floor.get("layer_id")),
    )


def _shiyu_v1_rating_counts(section: dict[str, Any]) -> list[tuple[str, int]]:
    counts: list[tuple[str, int]] = []
    for item in as_list(section.get("rating_list")):
        data = as_dict(item)
        counts.append((as_str(data.get("rating")).upper(), as_int(data.get("times"))))
    return counts


def _parse_shiyu_v1(
    section: dict[str, Any], raw: dict[str, Any], schema_version: str
) -> ParsedChallengeRun | None:
    schedule_id = as_optional_int(first_present(section, "schedule_id", "zone_id"))
    if schedule_id is None:
        return None

    entries = tuple(
        _parse_shiyu_v1_entry(position, item)
        for position, item in enumerate(as_list(section.get("all_floor_detail")), start=1)
    )
    counts = _shiyu_v1_rating_counts(section)
    counted_stars = sum(_stars_for(rating) * times for rating, times in counts)

    return ParsedChallengeRun(
        mode=MODE_SHIYU_DEFENSE,
        schedule_id=schedule_id,
        begin_time=to_datetime(first_present(section, "hadal_begin_time", "start_time")),
        end_time=to_datetime(first_present(section, "hadal_end_time", "end_time")),
        has_data=_has_data(section, entries),
        rating=_best_rating(rating for rating, times in counts if times > 0)
        or _best_rating(entry.rating for entry in entries),
        score=0,
        max_score=0,
        total_stars=counted_stars or sum(entry.stars for entry in entries),
        rank_percent=None,
        clear_time_seconds=as_optional_int(section.get("fast_layer_time")),
        schema_version=schema_version,
        entries=entries,
        raw=raw,
    )


def _layered_str(info: dict[str, Any], layer: dict[str, Any], *keys: str) -> str:
    return as_str(first_present(info, *keys)) or as_str(first_present(layer, *keys))


def _parse_shiyu_v2_entry(
    position: int, raw: Any, layer: dict[str, Any], layer_index: int | None
) -> ParsedChallengeEntry:
    info = as_dict(raw)
    rating = (as_str(info.get("rating")) or as_str(layer.get("rating"))).upper()
    challenged_at = to_datetime(info.get("challenge_time")) or to_datetime(
        layer.get("challenge_time")
    )
    return ParsedChallengeEntry(
        position=position,
        name=_layered_str(info, layer, "zone_name", "layer_name", "name"),
        rating=rating,
        score=as_int(info.get("score")),
        max_score=as_int(info.get("max_score")),
        stars=_stars_for(rating),
        clear_time_seconds=as_optional_int(info.get("battle_time")),
        challenged_at=challenged_at,
        boss_name=_layered_str(info, layer, "monster_name", "boss_name"),
        boss_icon=_layered_str(info, layer, "monster_pic", "boss_icon", "monster_icon"),
        buffs=_parse_buffs(info.get("buffer")) or _parse_buffs(layer.get("buffer")),
        agents=_parse_challenge_agents(first_present(info, "avatar_list", "avatars")),
        bangboo_id=_first_bangboo_id(info.get("buddy")),
        layer_index=layer_index,
        layer_id=as_optional_int(info.get("layer_id")),
    )


def _shiyu_v2_layers(section: dict[str, Any]) -> list[tuple[int | None, dict[str, Any]]]:
    layers: list[tuple[int | None, dict[str, Any]]] = []
    known: set[str] = set()
    for index, names in enumerate(LAYER_ORDINALS, start=1):
        keys = tuple(f"{name}{LAYER_DETAIL_SUFFIX}" for name in names)
        known.update(keys)
        layer = as_dict(first_present(section, *keys))
        if layer:
            layers.append((index, layer))
    for key, value in section.items():
        if not key.endswith(LAYER_DETAIL_SUFFIX) or key in known:
            continue
        layer = as_dict(value)
        if layer:
            layers.append((None, layer))
    return layers


def _shiyu_v2_entries(section: dict[str, Any]) -> tuple[ParsedChallengeEntry, ...]:
    entries: list[ParsedChallengeEntry] = []
    for layer_index, layer in _shiyu_v2_layers(section):
        for item in as_list(layer.get("layer_challenge_info_list")):
            entries.append(_parse_shiyu_v2_entry(len(entries) + 1, item, layer, layer_index))
    return tuple(entries)


def _parse_shiyu_v2(
    section: dict[str, Any], raw: dict[str, Any], schema_version: str
) -> ParsedChallengeRun | None:
    schedule_id = as_optional_int(first_present(section, "zone_id", "schedule_id"))
    if schedule_id is None:
        return None

    frozen_entries = _shiyu_v2_entries(section)

    brief = as_dict(section.get("brief"))
    return ParsedChallengeRun(
        mode=MODE_SHIYU_DEFENSE,
        schedule_id=schedule_id,
        begin_time=to_datetime(first_present(section, "hadal_begin_time", "start_time")),
        end_time=to_datetime(first_present(section, "hadal_end_time", "end_time")),
        has_data=_has_data(section, frozen_entries),
        rating=as_str(brief.get("rating")).upper()
        or _best_rating(entry.rating for entry in frozen_entries),
        score=as_int(brief.get("score")),
        max_score=as_int(brief.get("max_score")),
        total_stars=sum(entry.stars for entry in frozen_entries),
        rank_percent=as_optional_int(brief.get("rank_percent")),
        clear_time_seconds=as_optional_int(brief.get("battle_time")),
        schema_version=schema_version,
        entries=frozen_entries,
        raw=raw,
    )


def parse_shiyu_defense(data: dict[str, Any]) -> ParsedChallengeRun | None:
    payload = as_dict(data)
    declared_version = as_str(payload.get("hadal_ver")).lower()
    first_season = as_dict(payload.get("hadal_info_v1"))
    second_season = as_dict(payload.get("hadal_info_v2"))

    if declared_version == SCHEMA_V1 and first_season:
        return _parse_shiyu_v1(first_season, payload, SCHEMA_V1)
    if declared_version == SCHEMA_V2 and second_season:
        return _parse_shiyu_v2(second_season, payload, SCHEMA_V2)
    if second_season:
        return _parse_shiyu_v2(second_season, payload, declared_version or SCHEMA_V2)
    if first_season:
        return _parse_shiyu_v1(first_season, payload, declared_version or SCHEMA_V1)
    return None


def _parse_deadly_assault_entry(position: int, raw: Any) -> ParsedChallengeEntry:
    info = as_dict(raw)
    boss = first_dict(info.get("boss"))
    boss_name = as_str(first_present(boss, "name", "name_mi18n"))
    return ParsedChallengeEntry(
        position=position,
        name=boss_name,
        rating=as_str(info.get("rating")).upper(),
        score=as_int(info.get("score")),
        max_score=as_int(info.get("max_score")),
        stars=as_int(info.get("star")),
        clear_time_seconds=as_optional_int(info.get("battle_time")),
        challenged_at=to_datetime(first_present(info, "challenge_time", "battle_end_time")),
        boss_name=boss_name,
        boss_icon=as_str(first_present(boss, "icon", "bg_icon", "race_icon")),
        buffs=_parse_buffs(first_present(info, "buffer", "buffs")),
        agents=_parse_challenge_agents(first_present(info, "avatar_list", "avatars")),
        bangboo_id=_first_bangboo_id(info.get("buddy")),
    )


def parse_deadly_assault(data: dict[str, Any]) -> ParsedChallengeRun | None:
    payload = as_dict(data)
    schedule_id = as_optional_int(first_present(payload, "zone_id", "schedule_id"))
    if schedule_id is None:
        return None

    entries = tuple(
        _parse_deadly_assault_entry(position, item)
        for position, item in enumerate(as_list(payload.get("list")), start=1)
    )
    return ParsedChallengeRun(
        mode=MODE_DEADLY_ASSAULT,
        schedule_id=schedule_id,
        begin_time=to_datetime(first_present(payload, "start_time", "begin_time")),
        end_time=to_datetime(payload.get("end_time")),
        has_data=_has_data(payload, entries),
        rating=_best_rating(entry.rating for entry in entries),
        score=as_int(first_present(payload, "total_score", "score")),
        max_score=as_int(payload.get("max_score")),
        total_stars=as_int(first_present(payload, "total_star", "total_stars")),
        rank_percent=as_optional_int(payload.get("rank_percent")),
        clear_time_seconds=as_optional_int(payload.get("battle_time")),
        schema_version=SCHEMA_V2,
        entries=entries,
        raw=payload,
    )
