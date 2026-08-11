from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE

SCHEMA_V1 = "v1"
SCHEMA_V2 = "v2"

RATING_ORDER = ("B", "A", "S", "S+")
RATING_STARS = {"B": 1, "A": 2, "S": 3, "S+": 3}
RARITY_BY_LETTER = {"B": 2, "A": 3, "S": 4}

PROFILE_KEYS = ("role", "profile", "player", "cur_role", "account", "game_role")
NICKNAME_KEYS = ("nickname", "nick_name", "name")
LEVEL_KEYS = ("level", "role_level", "avatar_level")
AGENT_ICON_KEYS = ("role_square_url", "square_icon", "avatar_icon", "icon", "vertical_painting_url")
AGENT_NAME_KEYS = ("name_mi18n", "full_name_mi18n", "name")
BANGBOO_ICON_KEYS = ("bangboo_rectangle_url", "square_icon", "role_square_url", "icon")

LAYER_DETAIL_SUFFIX = "_layer_detail"
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


@dataclass(frozen=True, slots=True)
class ParsedChronicleAccount:
    nickname: str
    level: int


@dataclass(frozen=True, slots=True)
class ParsedRosterAgent:
    game_id: int
    level: int
    mindscape_level: int
    rarity: str
    element: str
    name: str
    icon: str


@dataclass(frozen=True, slots=True)
class ParsedBangboo:
    game_id: int
    name: str
    level: int
    rarity: int | None
    star: int
    icon: str


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return default


def _as_optional_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None


def _as_str(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bool) or value is None:
        return ""
    if isinstance(value, int):
        return str(value)
    return ""


def _first_present(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return None


def _first_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    for item in _as_list(value):
        if isinstance(item, dict):
            return item
    return {}


def _datetime_from_parts(parts: dict[str, Any]) -> datetime | None:
    year = _as_optional_int(parts.get("year"))
    month = _as_optional_int(parts.get("month"))
    day = _as_optional_int(parts.get("day"))
    if year is None or month is None or day is None:
        return None
    try:
        return datetime(
            year,
            month,
            day,
            _as_int(parts.get("hour")),
            _as_int(parts.get("minute")),
            _as_int(parts.get("second")),
            tzinfo=UTC,
        )
    except ValueError:
        return None


def _to_datetime(value: Any) -> datetime | None:
    if isinstance(value, dict):
        return _datetime_from_parts(value)
    seconds = _as_optional_int(value)
    if not seconds:
        return None
    try:
        return datetime.fromtimestamp(seconds, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


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


def _rarity_number(value: Any) -> int | None:
    if isinstance(value, str):
        return RARITY_BY_LETTER.get(value.strip().upper())
    return _as_optional_int(value)


def _parse_buffs(raw: Any) -> tuple[dict[str, str], ...]:
    items = [raw] if isinstance(raw, dict) else _as_list(raw)
    buffs: list[dict[str, str]] = []
    for item in items:
        data = _as_dict(item)
        title = _as_str(_first_present(data, "title", "name"))
        text = _as_str(_first_present(data, "text", "desc", "description"))
        if not title and not text:
            continue
        buffs.append({"title": title, "text": text, "icon": _as_str(data.get("icon"))})
    return tuple(buffs)


def _parse_challenge_agent(raw: Any) -> ParsedChallengeAgent | None:
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("id"))
    if game_id is None:
        return None
    return ParsedChallengeAgent(
        game_id=game_id,
        level=_as_int(data.get("level"), 1),
        rarity=_as_str(data.get("rarity")),
        element=_as_str(_first_present(data, "element_type", "element")),
        mindscape=_as_int(_first_present(data, "rank", "mindscape", "talent_level")),
        icon=_as_str(_first_present(data, *AGENT_ICON_KEYS)),
    )


def _parse_challenge_agents(*raws: Any) -> tuple[ParsedChallengeAgent, ...]:
    agents: list[ParsedChallengeAgent] = []
    seen: set[int] = set()
    for raw in raws:
        for item in _as_list(raw):
            agent = _parse_challenge_agent(item)
            if agent is None or agent.game_id in seen:
                continue
            seen.add(agent.game_id)
            agents.append(agent)
    return tuple(agents)


def _first_bangboo_id(*raws: Any) -> int | None:
    for raw in raws:
        bangboo_id = _as_optional_int(_as_dict(raw).get("id"))
        if bangboo_id is not None:
            return bangboo_id
    return None


def _has_data(section: dict[str, Any], entries: tuple[ParsedChallengeEntry, ...]) -> bool:
    flagged = section.get("has_data")
    if isinstance(flagged, bool):
        return flagged
    return bool(entries)


def _parse_shiyu_v1_entry(position: int, raw: Any) -> ParsedChallengeEntry:
    floor = _as_dict(raw)
    first_node = _as_dict(floor.get("node_1"))
    second_node = _as_dict(floor.get("node_2"))
    rating = _as_str(floor.get("rating")).upper()
    battle_times = [
        seconds
        for seconds in (
            _as_optional_int(first_node.get("battle_time")),
            _as_optional_int(second_node.get("battle_time")),
        )
        if seconds is not None
    ]
    return ParsedChallengeEntry(
        position=position,
        name=_as_str(_first_present(floor, "zone_name", "layer_name", "name")),
        rating=rating,
        score=_as_int(floor.get("score")),
        max_score=_as_int(floor.get("max_score")),
        stars=_stars_for(rating),
        clear_time_seconds=sum(battle_times) if battle_times else None,
        challenged_at=_to_datetime(_first_present(floor, "floor_challenge_time", "challenge_time")),
        boss_name="",
        boss_icon="",
        buffs=_parse_buffs(_first_present(floor, "buffs", "buffer")),
        agents=_parse_challenge_agents(first_node.get("avatars"), second_node.get("avatars")),
        bangboo_id=_first_bangboo_id(first_node.get("buddy"), second_node.get("buddy")),
        layer_index=_as_optional_int(_first_present(floor, "layer_index", "floor_index")),
        layer_id=_as_optional_int(floor.get("layer_id")),
    )


def _shiyu_v1_rating_counts(section: dict[str, Any]) -> list[tuple[str, int]]:
    counts: list[tuple[str, int]] = []
    for item in _as_list(section.get("rating_list")):
        data = _as_dict(item)
        counts.append((_as_str(data.get("rating")).upper(), _as_int(data.get("times"))))
    return counts


def _parse_shiyu_v1(
    section: dict[str, Any], raw: dict[str, Any], schema_version: str
) -> ParsedChallengeRun | None:
    schedule_id = _as_optional_int(_first_present(section, "schedule_id", "zone_id"))
    if schedule_id is None:
        return None

    entries = tuple(
        _parse_shiyu_v1_entry(position, item)
        for position, item in enumerate(_as_list(section.get("all_floor_detail")), start=1)
    )
    counts = _shiyu_v1_rating_counts(section)
    counted_stars = sum(_stars_for(rating) * times for rating, times in counts)

    return ParsedChallengeRun(
        mode=MODE_SHIYU_DEFENSE,
        schedule_id=schedule_id,
        begin_time=_to_datetime(_first_present(section, "hadal_begin_time", "start_time")),
        end_time=_to_datetime(_first_present(section, "hadal_end_time", "end_time")),
        has_data=_has_data(section, entries),
        rating=_best_rating(rating for rating, times in counts if times > 0)
        or _best_rating(entry.rating for entry in entries),
        score=0,
        max_score=0,
        total_stars=counted_stars or sum(entry.stars for entry in entries),
        rank_percent=None,
        clear_time_seconds=_as_optional_int(section.get("fast_layer_time")),
        schema_version=schema_version,
        entries=entries,
        raw=raw,
    )


def _layered_str(info: dict[str, Any], layer: dict[str, Any], *keys: str) -> str:
    return _as_str(_first_present(info, *keys)) or _as_str(_first_present(layer, *keys))


def _parse_shiyu_v2_entry(
    position: int, raw: Any, layer: dict[str, Any], layer_index: int | None
) -> ParsedChallengeEntry:
    info = _as_dict(raw)
    rating = (_as_str(info.get("rating")) or _as_str(layer.get("rating"))).upper()
    challenged_at = _to_datetime(info.get("challenge_time")) or _to_datetime(
        layer.get("challenge_time")
    )
    return ParsedChallengeEntry(
        position=position,
        name=_layered_str(info, layer, "zone_name", "layer_name", "name"),
        rating=rating,
        score=_as_int(info.get("score")),
        max_score=_as_int(info.get("max_score")),
        stars=_stars_for(rating),
        clear_time_seconds=_as_optional_int(info.get("battle_time")),
        challenged_at=challenged_at,
        boss_name=_layered_str(info, layer, "monster_name", "boss_name"),
        boss_icon=_layered_str(info, layer, "monster_pic", "boss_icon", "monster_icon"),
        buffs=_parse_buffs(info.get("buffer")) or _parse_buffs(layer.get("buffer")),
        agents=_parse_challenge_agents(_first_present(info, "avatar_list", "avatars")),
        bangboo_id=_first_bangboo_id(info.get("buddy")),
        layer_index=layer_index,
        layer_id=_as_optional_int(info.get("layer_id")),
    )


def _shiyu_v2_layers(section: dict[str, Any]) -> list[tuple[int | None, dict[str, Any]]]:
    layers: list[tuple[int | None, dict[str, Any]]] = []
    known: set[str] = set()
    for index, names in enumerate(LAYER_ORDINALS, start=1):
        keys = tuple(f"{name}{LAYER_DETAIL_SUFFIX}" for name in names)
        known.update(keys)
        layer = _as_dict(_first_present(section, *keys))
        if layer:
            layers.append((index, layer))
    for key, value in section.items():
        if not key.endswith(LAYER_DETAIL_SUFFIX) or key in known:
            continue
        layer = _as_dict(value)
        if layer:
            layers.append((None, layer))
    return layers


def _parse_shiyu_v2(
    section: dict[str, Any], raw: dict[str, Any], schema_version: str
) -> ParsedChallengeRun | None:
    schedule_id = _as_optional_int(_first_present(section, "zone_id", "schedule_id"))
    if schedule_id is None:
        return None

    entries: list[ParsedChallengeEntry] = []
    for layer_index, layer in _shiyu_v2_layers(section):
        for item in _as_list(layer.get("layer_challenge_info_list")):
            entries.append(_parse_shiyu_v2_entry(len(entries) + 1, item, layer, layer_index))
    frozen_entries = tuple(entries)

    brief = _as_dict(section.get("brief"))
    return ParsedChallengeRun(
        mode=MODE_SHIYU_DEFENSE,
        schedule_id=schedule_id,
        begin_time=_to_datetime(_first_present(section, "hadal_begin_time", "start_time")),
        end_time=_to_datetime(_first_present(section, "hadal_end_time", "end_time")),
        has_data=_has_data(section, frozen_entries),
        rating=_as_str(brief.get("rating")).upper()
        or _best_rating(entry.rating for entry in frozen_entries),
        score=_as_int(brief.get("score")),
        max_score=_as_int(brief.get("max_score")),
        total_stars=sum(entry.stars for entry in frozen_entries),
        rank_percent=_as_optional_int(brief.get("rank_percent")),
        clear_time_seconds=_as_optional_int(brief.get("battle_time")),
        schema_version=schema_version,
        entries=frozen_entries,
        raw=raw,
    )


def parse_shiyu_defense(data: dict[str, Any]) -> ParsedChallengeRun | None:
    payload = _as_dict(data)
    declared_version = _as_str(payload.get("hadal_ver")).lower()
    first_season = _as_dict(payload.get("hadal_info_v1"))
    second_season = _as_dict(payload.get("hadal_info_v2"))

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
    info = _as_dict(raw)
    boss = _first_dict(info.get("boss"))
    boss_name = _as_str(_first_present(boss, "name", "name_mi18n"))
    return ParsedChallengeEntry(
        position=position,
        name=boss_name,
        rating=_as_str(info.get("rating")).upper(),
        score=_as_int(info.get("score")),
        max_score=_as_int(info.get("max_score")),
        stars=_as_int(info.get("star")),
        clear_time_seconds=_as_optional_int(info.get("battle_time")),
        challenged_at=_to_datetime(_first_present(info, "challenge_time", "battle_end_time")),
        boss_name=boss_name,
        boss_icon=_as_str(_first_present(boss, "icon", "bg_icon", "race_icon")),
        buffs=_parse_buffs(_first_present(info, "buffer", "buffs")),
        agents=_parse_challenge_agents(_first_present(info, "avatar_list", "avatars")),
        bangboo_id=_first_bangboo_id(info.get("buddy")),
    )


def parse_deadly_assault(data: dict[str, Any]) -> ParsedChallengeRun | None:
    payload = _as_dict(data)
    schedule_id = _as_optional_int(_first_present(payload, "zone_id", "schedule_id"))
    if schedule_id is None:
        return None

    entries = tuple(
        _parse_deadly_assault_entry(position, item)
        for position, item in enumerate(_as_list(payload.get("list")), start=1)
    )
    return ParsedChallengeRun(
        mode=MODE_DEADLY_ASSAULT,
        schedule_id=schedule_id,
        begin_time=_to_datetime(_first_present(payload, "start_time", "begin_time")),
        end_time=_to_datetime(payload.get("end_time")),
        has_data=_has_data(payload, entries),
        rating=_best_rating(entry.rating for entry in entries),
        score=_as_int(_first_present(payload, "total_score", "score")),
        max_score=_as_int(payload.get("max_score")),
        total_stars=_as_int(_first_present(payload, "total_star", "total_stars")),
        rank_percent=_as_optional_int(payload.get("rank_percent")),
        clear_time_seconds=_as_optional_int(payload.get("battle_time")),
        schema_version=SCHEMA_V2,
        entries=entries,
        raw=payload,
    )


def _current_and_maximum(raw: Any, fallback_maximum: Any) -> tuple[int, int]:
    if isinstance(raw, dict):
        return (
            _as_int(_first_present(raw, "cur", "current", "done", "value", "num")),
            _as_int(_first_present(raw, "max", "total")),
        )
    return _as_int(raw), _as_int(fallback_maximum)


def _nested_int(raw: Any, *keys: str) -> int:
    if isinstance(raw, dict):
        return _as_int(_first_present(raw, *keys))
    return _as_int(raw)


def parse_lost_void(data: dict[str, Any]) -> ParsedLostVoid | None:
    payload = _as_dict(data)
    if not payload:
        return None

    exploration, max_exploration = _current_and_maximum(
        _first_present(payload, "exploration_log", "explore_log"),
        _first_present(payload, "max_exploration_log", "exploration_log_max"),
    )
    commissions_done, commissions_total = _current_and_maximum(
        _first_present(payload, "commission_progress", "commissions", "commission"),
        _first_present(payload, "commissions_total", "commission_total"),
    )
    ultimate = _first_present(payload, "ultimate_challenge", "ultimate")
    ultimate_tier = (
        _as_str(_first_present(_as_dict(ultimate), "tier", "rank", "name"))
        if isinstance(ultimate, dict)
        else _as_str(_first_present(payload, "ultimate_challenge_tier", "ultimate_tier"))
    )

    return ParsedLostVoid(
        license_level=_nested_int(
            _first_present(payload, "license_level", "license"), "level", "cur", "value"
        ),
        exploration_log=exploration,
        max_exploration_log=max_exploration,
        commissions_done=commissions_done or _as_int(payload.get("commissions_done")),
        commissions_total=commissions_total,
        ultimate_challenge_score=(
            _nested_int(ultimate, "score", "value")
            if isinstance(ultimate, dict)
            else _as_int(payload.get("ultimate_challenge_score"))
        ),
        ultimate_challenge_tier=ultimate_tier,
        data_collected=_nested_int(
            _first_present(payload, "data_collected", "collected_data", "data_num"),
            "cur",
            "num",
            "count",
            "value",
        ),
        raw=payload,
    )


def parse_chronicle_account(data: dict[str, Any]) -> ParsedChronicleAccount | None:
    payload = _as_dict(data)
    sources = [payload, *(_as_dict(payload.get(key)) for key in PROFILE_KEYS)]
    for source in sources:
        nickname = _as_str(_first_present(source, *NICKNAME_KEYS))
        level = _as_int(_first_present(source, *LEVEL_KEYS))
        if nickname or level:
            return ParsedChronicleAccount(nickname=nickname, level=level)
    return None


def _parse_roster_agent(raw: Any) -> ParsedRosterAgent | None:
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("id"))
    if game_id is None:
        return None
    return ParsedRosterAgent(
        game_id=game_id,
        level=_as_int(data.get("level"), 1),
        mindscape_level=_as_int(_first_present(data, "rank", "mindscape", "talent_level")),
        rarity=_as_str(data.get("rarity")),
        element=_as_str(_first_present(data, "element_type", "element")),
        name=_as_str(_first_present(data, *AGENT_NAME_KEYS)),
        icon=_as_str(_first_present(data, *AGENT_ICON_KEYS)),
    )


def parse_roster_agents(data: dict[str, Any]) -> tuple[ParsedRosterAgent, ...]:
    payload = _as_dict(data)
    raw_agents = _as_list(_first_present(payload, "avatar_list", "avatars", "list"))
    parsed = [_parse_roster_agent(item) for item in raw_agents]
    return tuple(agent for agent in parsed if agent is not None)


def _parse_bangboo(raw: Any) -> ParsedBangboo | None:
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("id"))
    if game_id is None:
        return None
    return ParsedBangboo(
        game_id=game_id,
        name=_as_str(_first_present(data, "name", "name_mi18n")),
        level=_as_int(data.get("level"), 1),
        rarity=_rarity_number(data.get("rarity")),
        star=_as_int(data.get("star")),
        icon=_as_str(_first_present(data, *BANGBOO_ICON_KEYS)),
    )


def parse_bangboos(data: dict[str, Any]) -> tuple[ParsedBangboo, ...]:
    payload = _as_dict(data)
    raw_bangboos = _as_list(_first_present(payload, "list", "buddy_list", "bangboo_list"))
    parsed = [_parse_bangboo(item) for item in raw_bangboos]
    return tuple(bangboo for bangboo in parsed if bangboo is not None)
