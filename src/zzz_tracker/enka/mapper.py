from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from zzz_tracker.enka.client import EnkaProfile
from zzz_tracker.enka.static_data import StaticData


@dataclass(frozen=True, slots=True)
class ParsedStat:
    prop_id: int
    value: int
    rolls: int = 0

    def as_substat(self) -> dict[str, int]:
        return {"prop_id": self.prop_id, "value": self.value, "rolls": self.rolls}


@dataclass(frozen=True, slots=True)
class ParsedWEngine:
    game_id: int
    level: int
    modification_level: int
    phase: int
    item_uid: int | None


@dataclass(frozen=True, slots=True)
class ParsedDisc:
    slot: int
    game_id: int
    set_id: int | None
    rarity: int | None
    level: int
    roll_count: int
    main_stat: ParsedStat | None
    substats: tuple[ParsedStat, ...]
    item_uid: int | None


@dataclass(frozen=True, slots=True)
class ParsedAgent:
    game_id: int
    level: int
    promotion_level: int
    mindscape_level: int
    core_skill_enhancement: int
    skill_levels: dict[str, int]
    weapon_effect_state: int | None
    obtained_at: datetime | None
    wengine: ParsedWEngine | None
    discs: tuple[ParsedDisc, ...]


@dataclass(frozen=True, slots=True)
class ParsedAccount:
    uid: str
    nickname: str
    level: int
    signature: str
    profile_id: int | None
    avatar_id: int | None
    title_id: int | None
    calling_card_id: int | None


@dataclass(frozen=True, slots=True)
class ParsedProfile:
    account: ParsedAccount
    agents: tuple[ParsedAgent, ...] = field(default_factory=tuple)
    ttl: int = 0


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.lstrip("-").isdigit():
        return int(value)
    return default


def _as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.lstrip("-").isdigit():
        return int(value)
    return None


def _timestamp_to_datetime(value: Any) -> datetime | None:
    seconds = _as_optional_int(value)
    if not seconds:
        return None
    try:
        return datetime.fromtimestamp(seconds, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


def parse_stat(raw: Any) -> ParsedStat | None:
    data = _as_dict(raw)
    prop_id = _as_optional_int(data.get("PropertyId"))
    if prop_id is None:
        return None
    return ParsedStat(
        prop_id=prop_id,
        value=_as_int(data.get("PropertyValue")),
        rolls=_as_int(data.get("PropertyLevel")),
    )


def parse_skill_levels(raw: Any) -> dict[str, int]:
    """Enka sends a list of `{Index, Level}` entries; older dumps use a plain mapping."""
    if isinstance(raw, dict):
        return {str(key): _as_int(value) for key, value in raw.items()}
    levels: dict[str, int] = {}
    for entry in _as_list(raw):
        data = _as_dict(entry)
        index = _as_optional_int(data.get("Index"))
        if index is None:
            continue
        levels[str(index)] = _as_int(data.get("Level"))
    return levels


def parse_wengine(raw: Any) -> ParsedWEngine | None:
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("Id"))
    if game_id is None:
        return None
    return ParsedWEngine(
        game_id=game_id,
        level=_as_int(data.get("Level"), 1),
        modification_level=_as_int(data.get("BreakLevel")),
        phase=_as_int(data.get("UpgradeLevel"), 1),
        item_uid=_as_optional_int(data.get("Uid")),
    )


def parse_disc(raw: Any, static: StaticData | None = None) -> ParsedDisc | None:
    entry = _as_dict(raw)
    equipment = _as_dict(entry.get("Equipment"))
    game_id = _as_optional_int(equipment.get("Id"))
    slot = _as_optional_int(entry.get("Slot"))
    if game_id is None or slot is None:
        return None

    main_stats = [parse_stat(item) for item in _as_list(equipment.get("MainStatList"))]
    substats = [parse_stat(item) for item in _as_list(equipment.get("RandomPropertyList"))]

    return ParsedDisc(
        slot=slot,
        game_id=game_id,
        set_id=static.disc_set_id(game_id) if static else None,
        rarity=static.disc_rarity(game_id) if static else None,
        level=_as_int(equipment.get("Level")),
        roll_count=_as_int(equipment.get("BreakLevel")),
        main_stat=next((stat for stat in main_stats if stat is not None), None),
        substats=tuple(stat for stat in substats if stat is not None),
        item_uid=_as_optional_int(equipment.get("Uid")),
    )


def parse_agent(raw: Any, static: StaticData | None = None) -> ParsedAgent | None:
    data = _as_dict(raw)
    game_id = _as_optional_int(data.get("Id"))
    if game_id is None:
        return None

    discs = [parse_disc(item, static) for item in _as_list(data.get("EquippedList"))]

    return ParsedAgent(
        game_id=game_id,
        level=_as_int(data.get("Level"), 1),
        promotion_level=_as_int(data.get("PromotionLevel")),
        mindscape_level=_as_int(data.get("TalentLevel")),
        core_skill_enhancement=_as_int(data.get("CoreSkillEnhancement")),
        skill_levels=parse_skill_levels(data.get("SkillLevelList")),
        weapon_effect_state=_as_optional_int(data.get("WeaponEffectState")),
        obtained_at=_timestamp_to_datetime(data.get("ObtainmentTimestamp")),
        wengine=parse_wengine(data.get("Weapon")),
        discs=tuple(disc for disc in discs if disc is not None),
    )


def parse_account(uid: str, player_info: dict[str, Any]) -> ParsedAccount:
    social = _as_dict(player_info.get("SocialDetail"))
    profile = _as_dict(social.get("ProfileDetail"))
    profile_uid = _as_optional_int(profile.get("Uid"))
    return ParsedAccount(
        uid=str(profile_uid) if profile_uid is not None else uid,
        nickname=str(profile.get("Nickname") or ""),
        level=_as_int(profile.get("Level")),
        signature=str(social.get("Desc") or ""),
        profile_id=_as_optional_int(profile.get("ProfileId")),
        avatar_id=_as_optional_int(profile.get("AvatarId")),
        title_id=_as_optional_int(profile.get("Title")),
        calling_card_id=_as_optional_int(profile.get("CallingCardId")),
    )


def parse_profile(profile: EnkaProfile, static: StaticData | None = None) -> ParsedProfile:
    player_info = profile.player_info
    showcase = _as_dict(player_info.get("ShowcaseDetail"))
    agents = [parse_agent(item, static) for item in _as_list(showcase.get("AvatarList"))]
    return ParsedProfile(
        account=parse_account(profile.uid, player_info),
        agents=tuple(agent for agent in agents if agent is not None),
        ttl=profile.ttl,
    )
