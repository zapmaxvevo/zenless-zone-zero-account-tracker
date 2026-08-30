"""Builds read from HoYoLAB's `avatar/info`, mapped onto the shapes Enka already fills.

Enka only exposes the handful of agents the player put in the showcase, while the Battle
Chronicle answers for the whole roster — one request per agent id, each one returning a
`data` with an `avatar_list` of a single agent. The two sources describe the same build with
different words, so the payloads are translated into the `Parsed*` dataclasses of
`enka.mapper` and stored through the very same path.

Two of those words needed care, both verified against the builds Enka had already stored for
the same six agents:

- a substat arrives as the accumulated value (`base`) plus the number of rolls behind it
  (`level`), whereas Enka reports the step of a single roll, so the value is `base / level`;
- the ids HoYoLAB uses for discs and W-Engines are the ones Enka uses, so the static data
  answers for them too.

Nothing here refuses a payload: an agent without an id, a missing W-Engine or a disc with a
shape nobody expected is skipped, exactly as the Enka mapper does.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from zzz_tracker.enka.mapper import ParsedAgent, ParsedDisc, ParsedStat, ParsedWEngine
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.hoyolab.mapper import (
    RARITY_BY_LETTER,
    _as_dict,
    _as_int,
    _as_list,
    _as_optional_int,
    _as_str,
)

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
    """Turn an accumulated substat into the per-roll step Enka stores.

    `base` is what the disc grants today and `level` how many rolls built it up, initial one
    included, so the step is their quotient. The 137 substats captured so far divide exactly;
    the rounding is only there so a future value that does not still lands on an integer.
    """
    data = _as_dict(raw)
    prop_id = _as_optional_int(data.get("property_id"))
    total = _stat_value(data.get("base"))
    if prop_id is None or total is None:
        return None

    rolls = _as_int(data.get("level"))
    step = total / Decimal(rolls) if rolls > 0 else total
    return ParsedStat(prop_id=prop_id, value=_rounded(step), rolls=rolls)


def parse_main_stat(raw: Any) -> ParsedStat | None:
    """The main stat comes whole, not per roll, and no roll ever went into it."""
    data = _as_dict(raw)
    prop_id = _as_optional_int(data.get("property_id"))
    value = _stat_value(data.get("base"))
    if prop_id is None or value is None:
        return None
    return ParsedStat(prop_id=prop_id, value=_rounded(value), rolls=0)


def parse_disc(raw: Any, static: StaticData | None = None) -> ParsedDisc | None:
    """Read one equipped drive disc.

    `equip_suit.suit_id` and the rarity letter already name the set and the grade, so the
    static data is only asked for what the payload leaves out. The roll count is not sent
    either: a disc gains one roll every three levels, so level 15 means the five rolls Enka
    reports. HoYoLAB does not carry the per-item uid Enka does.
    """
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("id"))
    slot = _as_optional_int(data.get("equipment_type"))
    if game_id is None or slot is None:
        return None

    level = _as_int(data.get("level"))
    set_id = _as_optional_int(_as_dict(data.get("equip_suit")).get("suit_id"))
    rarity = RARITY_BY_LETTER.get(_as_str(data.get("rarity")).upper())
    main_stats = [parse_main_stat(item) for item in _as_list(data.get("main_properties"))]
    substats = [parse_substat(item) for item in _as_list(data.get("properties"))]

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
    """Read the equipped W-Engine, whose `star` is the phase Enka calls UpgradeLevel.

    The modification level is missing from the payload and derived from the level instead: a
    W-Engine is modified every ten levels, so level 60 is the fifth and last modification.
    """
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("id"))
    if game_id is None:
        return None

    level = _as_int(data.get("level"), 1)
    modification_level = min(MAX_MODIFICATION_LEVEL, max(0, (level - 1) // LEVELS_PER_MODIFICATION))
    return ParsedWEngine(
        game_id=game_id,
        level=level,
        modification_level=modification_level,
        phase=_as_int(data.get("star"), 1),
        item_uid=None,
    )


def parse_skill_levels(raw: Any) -> dict[str, int]:
    """`{skill_type: level}`, the same keys (0, 1, 2, 3, 5 and 6) Enka indexes by."""
    levels: dict[str, int] = {}
    for entry in _as_list(raw):
        data = _as_dict(entry)
        skill_type = _as_optional_int(data.get("skill_type"))
        if skill_type is None:
            continue
        levels[str(skill_type)] = _as_int(data.get("level"))
    return levels


def parse_agent_build(raw: Any, static: StaticData | None = None) -> ParsedAgent | None:
    """Read one agent's whole build.

    Two values are derived rather than read. The core skill enhancement is the level of skill
    5 minus one, since HoYoLAB counts the base core skill as the first level. The promotion
    level is not sent at all and is derived from the level: an agent is promoted every ten
    levels, capped at six. At an exact multiple of ten that guess can be off by one — a level
    30 agent may still be waiting for its third promotion — and the next Enka sync corrects it.

    `weapon_effect_state` and `obtained_at` stay empty: the Battle Chronicle never mentions them.
    """
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("id"))
    if game_id is None:
        return None

    level = _as_int(data.get("level"), 1)
    skill_levels = parse_skill_levels(data.get("skills"))
    core_skill = skill_levels.get(str(CORE_SKILL_TYPE))
    discs = [parse_disc(item, static) for item in _as_list(data.get("equip"))]

    return ParsedAgent(
        game_id=game_id,
        level=level,
        promotion_level=min(MAX_PROMOTION_LEVEL, level // LEVELS_PER_PROMOTION),
        mindscape_level=_as_int(data.get("rank")),
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
        for entry in _as_list(_as_dict(payload).get("avatar_list")):
            if not isinstance(entry, dict):
                continue
            game_id = _as_optional_int(entry.get("id"))
            if game_id is not None:
                entries.append((game_id, entry))
    return tuple(entries)


def parse_agent_builds(
    payloads: Sequence[dict[str, Any]], static: StaticData | None = None
) -> tuple[ParsedAgent, ...]:
    """Read every build in a bundle of `avatar/info` responses, one agent per response."""
    agents = [parse_agent_build(entry, static) for _, entry in raw_agents(payloads)]
    return tuple(agent for agent in agents if agent is not None)
