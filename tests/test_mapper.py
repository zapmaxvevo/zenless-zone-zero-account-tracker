from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from zzz_tracker.enka.client import EnkaProfile
from zzz_tracker.enka.mapper import parse_profile
from zzz_tracker.enka.static_data import StaticData


def profile_of(payload: dict[str, Any]) -> EnkaProfile:
    return EnkaProfile(uid="1300000001", ttl=int(payload["ttl"]), payload=payload)


def test_a_showcase_becomes_an_account_with_its_agents_and_their_builds(
    enka_payload: dict[str, Any], static_data: StaticData
) -> None:
    parsed = parse_profile(profile_of(enka_payload), static_data)

    assert parsed.account.uid == "1300000001"
    assert parsed.account.nickname == "Phaethon"
    assert parsed.account.level == 55
    assert parsed.account.signature == "Proxy at work"
    assert parsed.account.profile_id == 1041
    assert parsed.account.avatar_id == 2011
    assert parsed.ttl == 60
    assert [agent.game_id for agent in parsed.agents] == [1041, 1191]

    soldier = parsed.agents[0]
    assert soldier.level == 60
    assert soldier.promotion_level == 5
    assert soldier.mindscape_level == 3
    assert soldier.core_skill_enhancement == 6
    assert soldier.skill_levels == {"0": 12, "1": 12, "2": 10, "3": 12, "5": 7, "6": 9}
    assert soldier.weapon_effect_state == 2
    assert soldier.obtained_at == datetime.fromtimestamp(1721000000, tz=UTC)

    assert soldier.wengine is not None
    assert soldier.wengine.game_id == 14104
    assert soldier.wengine.level == 60
    assert soldier.wengine.modification_level == 5
    assert soldier.wengine.phase == 1
    assert soldier.wengine.item_uid == 9001


def test_each_disc_carries_its_slot_stats_and_the_set_it_completes(
    enka_payload: dict[str, Any], static_data: StaticData
) -> None:
    parsed = parse_profile(profile_of(enka_payload), static_data)
    discs = parsed.agents[0].discs

    assert [disc.slot for disc in discs] == [1, 2, 3, 4, 5, 6]
    assert [disc.set_id for disc in discs] == [31000, 31000, 31000, 31000, 32800, 32800]
    assert {disc.rarity for disc in discs} == {4}

    first = discs[0]
    assert first.game_id == 31041
    assert first.level == 15
    assert first.roll_count == 5
    assert first.item_uid == 8001
    assert first.main_stat is not None
    assert first.main_stat.prop_id == 11103
    assert first.main_stat.value == 550
    # Enka sends the per-roll base, not the total: 240 is 2.4% of CRIT Rate for each of the
    # three rolls. The four levels add up to the four the disc dropped with plus its five procs.
    assert [stat.as_substat() for stat in first.substats] == [
        {"prop_id": 20103, "value": 240, "rolls": 3},
        {"prop_id": 21103, "value": 480, "rolls": 2},
        {"prop_id": 12103, "value": 19, "rolls": 2},
        {"prop_id": 13103, "value": 15, "rolls": 2},
    ]
    assert sum(stat.rolls for stat in first.substats) == 4 + first.roll_count


def test_an_agent_showcased_without_discs_still_maps_with_its_wengine(
    enka_payload: dict[str, Any], static_data: StaticData
) -> None:
    parsed = parse_profile(profile_of(enka_payload), static_data)
    ellen = parsed.agents[1]

    assert ellen.discs == ()
    assert ellen.wengine is not None
    assert ellen.wengine.phase == 3
    assert ellen.skill_levels == {"0": 8, "1": 6}


def test_without_the_static_data_discs_map_without_rarity_or_set(
    enka_payload: dict[str, Any],
) -> None:
    parsed = parse_profile(profile_of(enka_payload), static=None)
    discs = parsed.agents[0].discs

    assert len(discs) == 6
    assert {disc.rarity for disc in discs} == {None}
    assert {disc.set_id for disc in discs} == {None}


def test_an_empty_showcase_still_yields_the_account_it_belongs_to() -> None:
    payload = {
        "PlayerInfo": {
            "SocialDetail": {"ProfileDetail": {"Uid": 1300000002, "Nickname": "Fairy", "Level": 4}}
        },
        "uid": 1300000002,
        "ttl": 30,
    }

    parsed = parse_profile(EnkaProfile(uid="1300000002", ttl=30, payload=payload))

    assert parsed.account.nickname == "Fairy"
    assert parsed.account.signature == ""
    assert parsed.agents == ()


def test_a_truncated_payload_is_skipped_instead_of_breaking_the_import() -> None:
    payload = {
        "PlayerInfo": {
            "SocialDetail": None,
            "ShowcaseDetail": {
                "AvatarList": [
                    {"Level": 60},
                    {"Id": 1041, "Weapon": {}, "EquippedList": [{"Slot": 1}, {"Equipment": {}}]},
                ]
            },
        },
        "ttl": 0,
    }

    parsed = parse_profile(EnkaProfile(uid="1300000003", ttl=0, payload=payload))

    assert parsed.account.uid == "1300000003"
    assert parsed.account.nickname == ""
    assert [agent.game_id for agent in parsed.agents] == [1041]
    assert parsed.agents[0].wengine is None
    assert parsed.agents[0].discs == ()
