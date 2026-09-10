"""Builds read from HoYoLAB's `avatar/info`, mapped onto the `Parsed*` shapes Enka already fills."""

from __future__ import annotations

from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from zzz_tracker.enka.mapper import ParsedAgent, ParsedDisc, ParsedStat, ParsedWEngine
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.hoyolab.common import RARITY_BY_LETTER
from zzz_tracker.parsing import as_dict, as_int, as_list, as_optional_int, as_str

PERCENT_SCALE = 100
CORE_SKILL_TYPE = 5
LEVELS_PER_PROMOTION = 10
MAX_PROMOTION_LEVEL = 6
LEVELS_PER_MODIFICATION = 10
MAX_MODIFICATION_LEVEL = 5
LEVELS_PER_ROLL = 3


def _stat_value(raw: Any) -> Decimal | None:
    """Read a stat as the integer scale Enka uses: `"38"` is 38 and `"4.8%"` is 480."""
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, int | float):
        return Decimal(str(raw))
    if not isinstance(raw, str):
        return None

    text = raw.strip()
    if not text:
        return None
    scale = 1
    if text.endswith("%"):
        text = text[:-1].strip()
        scale = PERCENT_SCALE
    try:
        return Decimal(text) * scale
    except InvalidOperation:
        return None


def _rounded(value: Decimal) -> int:
    """Half away from zero, the reading a player sees: `2.5` is 3, never 2."""
    return int(value.to_integral_value(rounding=ROUND_HALF_UP))


def parse_substat(raw: Any) -> ParsedStat | None:
    """Turn an accumulated substat (`base` over `level` rolls) into the per-roll step Enka wants."""
    data = as_dict(raw)
    prop_id = as_optional_int(data.get("property_id"))
    total = _stat_value(data.get("base"))
    if prop_id is None or total is None:
        return None

    rolls = as_int(data.get("level"))
    step = total / Decimal(rolls) if rolls > 0 else total
    return ParsedStat(prop_id=prop_id, value=_rounded(step), rolls=rolls)


def parse_main_stat(raw: Any) -> ParsedStat | None:
    """The main stat comes whole, not per roll, and no roll ever went into it."""
    data = as_dict(raw)
    prop_id = as_optional_int(data.get("property_id"))
    value = _stat_value(data.get("base"))
    if prop_id is None or value is None:
        return None
    return ParsedStat(prop_id=prop_id, value=_rounded(value), rolls=0)


def parse_disc(raw: Any, static: StaticData | None = None) -> ParsedDisc | None:
    """Read one equipped drive disc; the static data only answers for what the payload omits."""
    data = as_dict(raw)
    game_id = as_optional_int(data.get("id"))
    slot = as_optional_int(data.get("equipment_type"))
    if game_id is None or slot is None:
        return None

    level = as_int(data.get("level"))
    set_id = as_optional_int(as_dict(data.get("equip_suit")).get("suit_id"))
    rarity = RARITY_BY_LETTER.get(as_str(data.get("rarity")).upper())
    main_stats = [parse_main_stat(item) for item in as_list(data.get("main_properties"))]
    substats = [parse_substat(item) for item in as_list(data.get("properties"))]

    return ParsedDisc(
        slot=slot,
        game_id=game_id,
        set_id=set_id if set_id is not None else (static.disc_set_id(game_id) if static else None),
        rarity=rarity if rarity is not None else (static.disc_rarity(game_id) if static else None),
        level=level,
        roll_count=level // LEVELS_PER_ROLL,
        main_stat=next((stat for stat in main_stats if stat is not None), None),
        substats=tuple(stat for stat in substats if stat is not None),
        item_uid=None,
    )


def parse_wengine(raw: Any) -> ParsedWEngine | None:
    """Read the equipped W-Engine, whose `star` is the phase Enka calls UpgradeLevel."""
    data = as_dict(raw)
    game_id = as_optional_int(data.get("id"))
    if game_id is None:
        return None

    level = as_int(data.get("level"), 1)
    modification_level = min(MAX_MODIFICATION_LEVEL, max(0, (level - 1) // LEVELS_PER_MODIFICATION))
    return ParsedWEngine(
        game_id=game_id,
        level=level,
        modification_level=modification_level,
        phase=as_int(data.get("star"), 1),
        item_uid=None,
    )


def parse_skill_levels(raw: Any) -> dict[str, int]:
    """`{skill_type: level}`, the same keys (0, 1, 2, 3, 5 and 6) Enka indexes by."""
    levels: dict[str, int] = {}
    for entry in as_list(raw):
        data = as_dict(entry)
        skill_type = as_optional_int(data.get("skill_type"))
        if skill_type is None:
            continue
        levels[str(skill_type)] = as_int(data.get("level"))
    return levels


def parse_agent_build(raw: Any, static: StaticData | None = None) -> ParsedAgent | None:
    """Read one agent's whole build; promotion and core skill enhancement are derived, not sent."""
    data = as_dict(raw)
    game_id = as_optional_int(data.get("id"))
    if game_id is None:
        return None

    level = as_int(data.get("level"), 1)
    skill_levels = parse_skill_levels(data.get("skills"))
    core_skill = skill_levels.get(str(CORE_SKILL_TYPE))
    discs = [parse_disc(item, static) for item in as_list(data.get("equip"))]

    return ParsedAgent(
        game_id=game_id,
        level=level,
        promotion_level=min(MAX_PROMOTION_LEVEL, level // LEVELS_PER_PROMOTION),
        mindscape_level=as_int(data.get("rank")),
        core_skill_enhancement=max(0, core_skill - 1) if core_skill else 0,
        skill_levels=skill_levels,
        weapon_effect_state=None,
        obtained_at=None,
        wengine=parse_wengine(data.get("weapon")),
        discs=tuple(disc for disc in discs if disc is not None),
    )


def raw_agents(payloads: Sequence[dict[str, Any]]) -> tuple[tuple[int, dict[str, Any]], ...]:
    """Every agent entry the payloads carry, by id and untouched, as the snapshots store them."""
    entries: list[tuple[int, dict[str, Any]]] = []
    for payload in payloads:
        for entry in as_list(as_dict(payload).get("avatar_list")):
            if not isinstance(entry, dict):
                continue
            game_id = as_optional_int(entry.get("id"))
            if game_id is not None:
                entries.append((game_id, entry))
    return tuple(entries)


def parse_agent_builds(
    payloads: Sequence[dict[str, Any]], static: StaticData | None = None
) -> tuple[ParsedAgent, ...]:
    """Read every build in a bundle of `avatar/info` responses, one agent per response."""
    agents = [parse_agent_build(entry, static) for _, entry in raw_agents(payloads)]
    return tuple(agent for agent in agents if agent is not None)
