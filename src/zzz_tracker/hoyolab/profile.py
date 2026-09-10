"""Who the account is and what it owns: record card, chronicle profile, roster and bangboos."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from zzz_tracker.hoyolab.common import AGENT_ICON_KEYS, rarity_number
from zzz_tracker.parsing import as_dict, as_int, as_list, as_optional_int, as_str, first_present

ZZZ_GAME_ID = 8

# Conjecture: the `index` a browser really receives carries no profile under any of these.
PROFILE_KEYS = ("role", "profile", "player", "cur_role", "account", "game_role")
NICKNAME_KEYS = ("nickname", "nick_name", "name")
UID_KEYS = ("game_role_id", "game_uid", "uid", "role_id")
LEVEL_KEYS = ("level", "role_level", "avatar_level")
AGENT_NAME_KEYS = ("name_mi18n", "full_name_mi18n", "name")
# Only `bangboo_square_url` was ever observed against the real API; the rest are fallbacks.
BANGBOO_ICON_KEYS = (
    "bangboo_square_url",
    "bangboo_rectangle_url",
    "square_icon",
    "role_square_url",
    "icon",
)


@dataclass(frozen=True, slots=True)
class ParsedChronicleAccount:
    nickname: str
    level: int


@dataclass(frozen=True, slots=True)
class ParsedRecordCard:
    """Who the chronicle belongs to, which the chronicle itself never says."""

    uid: str
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


def parse_record_card(data: dict[str, Any]) -> ParsedRecordCard | None:
    """Read the ZZZ entry of `getGameRecordCard`, the only payload that names the player."""
    payload = as_dict(data)
    game_id = as_optional_int(payload.get("game_id"))
    if game_id is not None and game_id != ZZZ_GAME_ID:
        return None

    uid = as_str(first_present(payload, *UID_KEYS))
    nickname = as_str(first_present(payload, *NICKNAME_KEYS))
    level = as_int(first_present(payload, *LEVEL_KEYS))
    if not uid and not nickname and not level:
        return None
    return ParsedRecordCard(uid=uid, nickname=nickname, level=level)


def parse_challenge_nickname(data: dict[str, Any]) -> str:
    """The nickname the challenge payloads sign their answer with, at their root."""
    return as_str(first_present(as_dict(data), *NICKNAME_KEYS))


def parse_chronicle_account(data: dict[str, Any]) -> ParsedChronicleAccount | None:
    """Read the profile out of the `index`, for the versions of it that carry one."""
    payload = as_dict(data)
    sources = [payload, *(as_dict(payload.get(key)) for key in PROFILE_KEYS)]
    for source in sources:
        nickname = as_str(first_present(source, *NICKNAME_KEYS))
        level = as_int(first_present(source, *LEVEL_KEYS))
        if nickname or level:
            return ParsedChronicleAccount(nickname=nickname, level=level)
    return None


def parse_chronicle_uid(data: dict[str, Any]) -> str:
    """The UID the `index` claims, empty for the real payload, which never claims one."""
    payload = as_dict(data)
    for source in (payload, *(as_dict(payload.get(key)) for key in PROFILE_KEYS)):
        uid = as_str(first_present(source, *UID_KEYS))
        if uid:
            return uid
    return ""


def _parse_roster_agent(raw: Any) -> ParsedRosterAgent | None:
    data = as_dict(raw)
    game_id = as_optional_int(data.get("id"))
    if game_id is None:
        return None
    return ParsedRosterAgent(
        game_id=game_id,
        level=as_int(data.get("level"), 1),
        mindscape_level=as_int(first_present(data, "rank", "mindscape", "talent_level")),
        rarity=as_str(data.get("rarity")),
        element=as_str(first_present(data, "element_type", "element")),
        name=as_str(first_present(data, *AGENT_NAME_KEYS)),
        icon=as_str(first_present(data, *AGENT_ICON_KEYS)),
    )


def parse_roster_agents(data: dict[str, Any]) -> tuple[ParsedRosterAgent, ...]:
    payload = as_dict(data)
    raw_agents = as_list(first_present(payload, "avatar_list", "avatars", "list"))
    parsed = [_parse_roster_agent(item) for item in raw_agents]
    return tuple(agent for agent in parsed if agent is not None)


def _parse_bangboo(raw: Any) -> ParsedBangboo | None:
    data = as_dict(raw)
    game_id = as_optional_int(data.get("id"))
    if game_id is None:
        return None
    return ParsedBangboo(
        game_id=game_id,
        name=as_str(first_present(data, "name", "name_mi18n")),
        level=as_int(data.get("level"), 1),
        rarity=rarity_number(data.get("rarity")),
        star=as_int(data.get("star")),
        icon=as_str(first_present(data, *BANGBOO_ICON_KEYS)),
    )


def parse_bangboos(data: dict[str, Any]) -> tuple[ParsedBangboo, ...]:
    payload = as_dict(data)
    raw_bangboos = as_list(first_present(payload, "list", "buddy_list", "bangboo_list"))
    parsed = [_parse_bangboo(item) for item in raw_bangboos]
    return tuple(bangboo for bangboo in parsed if bangboo is not None)
