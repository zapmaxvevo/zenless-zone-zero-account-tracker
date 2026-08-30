from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from zzz_tracker.hoyolab.mapper import (
    parse_bangboos,
    parse_challenge_nickname,
    parse_chronicle_account,
    parse_chronicle_uid,
    parse_deadly_assault,
    parse_lost_void,
    parse_record_card,
    parse_roster_agents,
    parse_shiyu_defense,
)
from zzz_tracker.storage.models import MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE

FIXTURES_DIR = Path(__file__).parent / "fixtures"

EPOCH_CHALLENGE_TIME = 1780900000


def hoyolab_payload(name: str) -> dict[str, Any]:
    raw = (FIXTURES_DIR / f"hoyolab_{name}.json").read_text(encoding="utf-8")
    payload: dict[str, Any] = json.loads(raw)
    return payload


def shiyu_v2_season(layer: dict[str, Any], attempt: dict[str, Any]) -> dict[str, Any]:
    return {
        "hadal_ver": "v2",
        "hadal_info_v2": {
            "zone_id": 3903,
            "fitfh_layer_detail": {**layer, "layer_challenge_info_list": [attempt]},
        },
    }


def test_a_v1_shiyu_season_becomes_a_run_with_one_entry_per_cleared_floor() -> None:
    run = parse_shiyu_defense(hoyolab_payload("shiyu_v1"))

    assert run is not None
    assert run.mode == MODE_SHIYU_DEFENSE
    assert run.schedule_id == 3901
    assert run.schema_version == "v1"
    assert run.begin_time == datetime(2026, 6, 1, 4, 0, 0, tzinfo=UTC)
    assert run.end_time == datetime(2026, 6, 15, 3, 59, 59, tzinfo=UTC)
    assert run.has_data is True
    assert run.rating == "S"
    assert run.total_stars == 20
    assert run.clear_time_seconds == 118
    assert run.rank_percent is None
    assert run.raw["hadal_ver"] == "v1"

    top_floor = run.entries[0]
    assert top_floor.position == 1
    assert top_floor.name == "Corrupted District"
    assert top_floor.rating == "S"
    assert top_floor.stars == 3
    assert top_floor.clear_time_seconds == 118
    assert top_floor.challenged_at == datetime(2026, 6, 8, 22, 41, 12, tzinfo=UTC)
    assert top_floor.bangboo_id == 53001
    assert top_floor.layer_index == 7
    assert top_floor.layer_id == 7
    assert top_floor.buffs[0] == {
        "title": "Chaotic Resonance",
        "text": "Ether DMG dealt by squad members increases by 30%.",
        "icon": "",
    }
    assert [agent.game_id for agent in top_floor.agents] == [1041, 1131, 1211, 1241]

    soldier = top_floor.agents[0]
    assert soldier.level == 60
    assert soldier.rarity == "A"
    assert soldier.element == "201"
    assert soldier.mindscape == 6
    assert soldier.icon.endswith("/1041.png")


def test_a_v2_shiyu_season_is_normalised_into_the_same_run_as_v1() -> None:
    run = parse_shiyu_defense(hoyolab_payload("shiyu_v2"))

    assert run is not None
    assert run.mode == MODE_SHIYU_DEFENSE
    assert run.schedule_id == 3902
    assert run.schema_version == "v2"
    assert run.begin_time == datetime.fromtimestamp(1781000000, tz=UTC)
    assert run.end_time == datetime.fromtimestamp(1782200000, tz=UTC)
    assert run.has_data is True
    assert run.rating == "S+"
    assert run.score == 32450
    assert run.max_score == 36000
    assert run.rank_percent == 250
    assert run.clear_time_seconds == 214
    assert run.total_stars == 14

    fourth, fifth = run.entries[3], run.entries[4]
    assert [entry.position for entry in run.entries] == [1, 2, 3, 4, 5]
    assert fourth.rating == "S"
    assert fourth.score == 15200
    assert fourth.max_score == 16000
    assert fourth.clear_time_seconds == 96
    assert fourth.boss_icon.endswith("/3122.png")
    assert fourth.challenged_at == datetime(2026, 6, 20, 21, 5, 30, tzinfo=UTC)
    assert [buff["title"] for buff in fourth.buffs] == ["Nucleus Overload"]
    assert [agent.game_id for agent in fourth.agents] == [1041, 1131, 1211]
    assert fourth.bangboo_id == 53001

    assert fifth.rating == "S+"
    assert fifth.stars == 3
    assert fifth.score == 17250
    assert fifth.challenged_at == datetime(2026, 6, 21, 20, 15, 0, tzinfo=UTC)
    assert [buff["title"] for buff in fifth.buffs] == ["Void Hunger"]
    assert [agent.game_id for agent in fifth.agents] == [1241, 1211]


def test_a_v2_season_keeps_every_layer_and_not_only_the_two_of_the_critical_node() -> None:
    run = parse_shiyu_defense(hoyolab_payload("shiyu_v2"))

    assert run is not None
    assert [entry.layer_index for entry in run.entries] == [1, 2, 3, 4, 5]
    assert [entry.layer_id for entry in run.entries] == [11, 21, 31, 41, 51]
    assert [entry.rating for entry in run.entries] == ["S", "S", "A", "S", "S+"]


def test_a_v2_layer_named_with_an_unknown_ordinal_is_read_without_a_layer_index() -> None:
    run = parse_shiyu_defense(
        {
            "hadal_ver": "v2",
            "hadal_info_v2": {
                "zone_id": 3904,
                "eighth_layer_detail": {
                    "rating": "A",
                    "layer_challenge_info_list": [{"layer_id": 81, "rating": "A", "score": 900}],
                },
            },
        }
    )

    assert run is not None
    entry = run.entries[0]
    assert entry.position == 1
    assert entry.layer_index is None
    assert entry.layer_id == 81
    assert entry.score == 900


def test_a_v2_attempt_reads_the_zone_and_the_boss_its_layer_names_when_it_names_neither() -> None:
    run = parse_shiyu_defense(
        shiyu_v2_season(
            layer={
                "zone_name": "Corrupted District",
                "monster_name": "Withering Garden",
                "monster_pic": "https://act-webstatic.hoyoverse.com/zzz/monster/3122.png",
            },
            attempt={"rating": "S", "score": 15200},
        )
    )

    assert run is not None
    attempt = run.entries[0]
    assert attempt.name == "Corrupted District"
    assert attempt.boss_name == "Withering Garden"
    assert attempt.boss_icon.endswith("/3122.png")


def test_a_v2_attempt_that_names_its_own_zone_and_boss_keeps_them_over_the_layer_ones() -> None:
    run = parse_shiyu_defense(
        shiyu_v2_season(
            layer={
                "zone_name": "Corrupted District",
                "monster_name": "Withering Garden",
                "monster_pic": "https://act-webstatic.hoyoverse.com/zzz/monster/3122.png",
            },
            attempt={
                "zone_name": "Blazing Boneyard",
                "monster_name": "Doppelganger: Marionette",
                "monster_pic": "https://act-webstatic.hoyoverse.com/zzz/monster/3401.png",
            },
        )
    )

    assert run is not None
    attempt = run.entries[0]
    assert attempt.name == "Blazing Boneyard"
    assert attempt.boss_name == "Doppelganger: Marionette"
    assert attempt.boss_icon.endswith("/3401.png")


def test_a_v2_attempt_no_one_names_reads_empty_instead_of_breaking_the_season() -> None:
    run = parse_shiyu_defense(
        shiyu_v2_season(layer={"rating": "S+"}, attempt={"score": 17250, "battle_time": 118})
    )

    assert run is not None
    attempt = run.entries[0]
    assert attempt.name == ""
    assert attempt.boss_name == ""
    assert attempt.boss_icon == ""
    assert attempt.rating == "S+"
    assert attempt.score == 17250


def test_the_hundredths_of_a_percent_hoyolab_ranks_with_are_kept_as_they_arrive() -> None:
    run = parse_shiyu_defense(hoyolab_payload("shiyu_v2"))

    assert run is not None
    assert run.rank_percent == 250


def test_a_deadly_assault_season_keeps_every_boss_with_its_buffs_and_its_squad() -> None:
    run = parse_deadly_assault(hoyolab_payload("deadly_assault"))

    assert run is not None
    assert run.mode == MODE_DEADLY_ASSAULT
    assert run.schedule_id == 2201
    assert run.begin_time == datetime(2026, 6, 1, 4, 0, 0, tzinfo=UTC)
    assert run.end_time == datetime(2026, 6, 22, 3, 59, 59, tzinfo=UTC)
    assert run.has_data is True
    assert run.score == 21460
    assert run.total_stars == 8
    assert run.rank_percent == 1200
    assert [entry.position for entry in run.entries] == [1, 2, 3]

    marionette = run.entries[0]
    assert marionette.name == "Marionette Ritter"
    assert marionette.boss_name == "Marionette Ritter"
    assert marionette.boss_icon.endswith("/marionette.png")
    assert marionette.score == 8200
    assert marionette.stars == 3
    assert marionette.challenged_at == datetime(2026, 6, 3, 19, 22, 40, tzinfo=UTC)
    assert marionette.buffs == (
        {
            "title": "Ferocious Assault",
            "text": "Squad members deal 20% more DMG to stunned enemies.",
            "icon": "https://act-webstatic.hoyoverse.com/zzz/buff/ferocious.png",
        },
        {
            "title": "Cold Front",
            "text": "Ice DMG increases by 15%.",
            "icon": "https://act-webstatic.hoyoverse.com/zzz/buff/cold_front.png",
        },
    )
    assert [agent.game_id for agent in marionette.agents] == [1191, 1131, 1261]
    assert marionette.bangboo_id == 53201

    unnamed = run.entries[2]
    assert unnamed.boss_name == ""
    assert unnamed.boss_icon == ""
    assert unnamed.buffs == ()
    assert unnamed.bangboo_id is None
    assert unnamed.stars == 2


def test_a_squad_snapshot_carries_the_agent_as_it_was_that_day() -> None:
    run = parse_deadly_assault(hoyolab_payload("deadly_assault"))

    assert run is not None
    assert run.entries[0].agents[0].as_snapshot() == {
        "game_id": 1191,
        "level": 60,
        "rarity": "S",
        "element": "202",
        "mindscape": 2,
        "icon": "https://act-webstatic.hoyoverse.com/zzz/avatar/1191.png",
    }


def test_dates_sent_as_epochs_and_as_calendar_parts_both_land_on_the_same_utc_moment() -> None:
    moment = datetime(2026, 6, 1, 4, 0, 0, tzinfo=UTC)
    calendar_season = {
        "zone_id": 2201,
        "start_time": {"year": 2026, "month": 6, "day": 1, "hour": 4, "minute": 0, "second": 0},
        "list": [],
    }
    epoch_season = {"zone_id": 2201, "start_time": int(moment.timestamp()), "list": []}

    from_calendar = parse_deadly_assault(calendar_season)
    from_epoch = parse_deadly_assault(epoch_season)

    assert from_calendar is not None
    assert from_epoch is not None
    assert from_calendar.begin_time == moment
    assert from_epoch.begin_time == moment
    assert from_calendar.end_time is None


def test_a_floor_timed_with_an_epoch_reads_the_same_as_one_timed_with_parts() -> None:
    run = parse_shiyu_defense(hoyolab_payload("shiyu_v1"))

    assert run is not None
    lower_floor = run.entries[1]
    assert lower_floor.challenged_at == datetime.fromtimestamp(EPOCH_CHALLENGE_TIME, tz=UTC)
    assert lower_floor.rating == "A"
    assert lower_floor.stars == 2
    assert lower_floor.clear_time_seconds == 94
    assert lower_floor.buffs == ()
    assert lower_floor.bangboo_id is None
    assert [agent.game_id for agent in lower_floor.agents] == [1191]


def test_a_payload_without_a_playable_season_is_not_a_run_at_all() -> None:
    assert parse_shiyu_defense({}) is None
    assert parse_shiyu_defense({"hadal_ver": "v2", "hadal_info_v2": {}}) is None
    assert parse_shiyu_defense({"hadal_ver": "v1", "hadal_info_v1": {"has_data": False}}) is None
    assert parse_deadly_assault({}) is None
    assert parse_deadly_assault({"has_data": False, "list": []}) is None
    assert parse_lost_void({}) is None
    assert parse_chronicle_account({}) is None
    assert parse_roster_agents({}) == ()
    assert parse_bangboos({}) == ()


def test_a_season_stripped_of_its_details_falls_back_to_defaults_instead_of_failing() -> None:
    run = parse_shiyu_defense(
        {
            "hadal_ver": "v2",
            "hadal_info_v2": {
                "zone_id": 4000,
                "fitfh_layer_detail": {"layer_challenge_info_list": [{}]},
            },
        }
    )

    assert run is not None
    assert run.schedule_id == 4000
    assert run.begin_time is None
    assert run.end_time is None
    assert run.rating == ""
    assert run.score == 0
    assert run.max_score == 0
    assert run.rank_percent is None
    assert run.clear_time_seconds is None
    assert run.total_stars == 0

    entry = run.entries[0]
    assert entry.position == 1
    assert entry.name == ""
    assert entry.rating == ""
    assert entry.stars == 0
    assert entry.challenged_at is None
    assert entry.boss_name == ""
    assert entry.buffs == ()
    assert entry.agents == ()
    assert entry.bangboo_id is None


def test_an_assault_answered_with_the_wrong_shapes_keeps_the_entries_it_can_read() -> None:
    run = parse_deadly_assault(
        {
            "zone_id": 2202,
            "list": [
                {"boss": "Marionette Ritter", "buffer": {"name": "Solo Buff", "desc": "Alone"}},
                {"star": "3", "avatar_list": {"id": 1041}},
            ],
        }
    )

    assert run is not None
    assert run.has_data is True
    assert run.entries[0].boss_name == ""
    assert run.entries[0].buffs == ({"title": "Solo Buff", "text": "Alone", "icon": ""},)
    assert run.entries[1].stars == 3
    assert run.entries[1].agents == ()


def test_lost_void_progress_is_read_from_the_nested_payload() -> None:
    progress = parse_lost_void(hoyolab_payload("lost_void"))

    assert progress is not None
    assert progress.license_level == 12
    assert progress.exploration_log == 4200
    assert progress.max_exploration_log == 5000
    assert progress.commissions_done == 7
    assert progress.commissions_total == 10
    assert progress.ultimate_challenge_score == 4180
    assert progress.ultimate_challenge_tier == "Tier V"
    assert progress.data_collected == 86
    assert progress.raw["license"] == {"level": 12, "name": "Class-B Investigator"}


def test_lost_void_progress_is_read_the_same_when_the_payload_comes_flat() -> None:
    progress = parse_lost_void(
        {
            "license_level": 9,
            "exploration_log": 3100,
            "max_exploration_log": 5000,
            "commissions_done": 4,
            "commissions_total": 10,
            "ultimate_challenge_score": 2600,
            "ultimate_challenge_tier": "Tier III",
            "data_collected": 55,
        }
    )

    assert progress is not None
    assert progress.license_level == 9
    assert progress.exploration_log == 3100
    assert progress.max_exploration_log == 5000
    assert progress.commissions_done == 4
    assert progress.commissions_total == 10
    assert progress.ultimate_challenge_score == 2600
    assert progress.ultimate_challenge_tier == "Tier III"
    assert progress.data_collected == 55


def test_the_chronicle_index_yields_the_nickname_and_level_of_the_account() -> None:
    account = parse_chronicle_account(hoyolab_payload("index"))

    assert account is not None
    assert account.nickname == "Phaethon"
    assert account.level == 55


def test_the_chronicle_index_still_reads_when_the_profile_sits_at_the_top_level() -> None:
    account = parse_chronicle_account({"nick_name": "Fairy", "role_level": 4, "stats": {}})

    assert account is not None
    assert account.nickname == "Fairy"
    assert account.level == 4


def test_the_record_card_names_the_account_the_chronicle_never_names() -> None:
    card = parse_record_card(hoyolab_payload("record_card"))

    assert card is not None
    assert card.uid == "1300000001"
    assert card.nickname == "Proxy Phaethon"
    assert card.level == 60


def test_a_record_card_of_another_game_is_not_read_as_this_account() -> None:
    genshin = dict(hoyolab_payload("record_card"), game_id=2, game_role_id="800000001")

    assert parse_record_card(genshin) is None


def test_a_record_card_with_nothing_to_say_is_no_card_at_all() -> None:
    assert parse_record_card({}) is None
    assert parse_record_card({"has_role": False, "game_id": 8}) is None


def test_the_real_index_carries_no_profile_to_read() -> None:
    """The `index` a browser receives has stats and lists, and nothing that names the player."""
    index = {
        "stats": {"active_days": 412, "avatar_num": 38},
        "avatar_list": [],
        "buddy_list": [],
        "cat_notes_list": [],
        "game_data_show": {},
        "area_collections": [],
        "award_state": "Received",
        "challenge_schedule_list": [],
    }

    assert parse_chronicle_account(index) is None
    assert parse_chronicle_uid(index) == ""


def test_the_challenge_payloads_sign_their_answer_with_the_nickname() -> None:
    assert parse_challenge_nickname(hoyolab_payload("deadly_assault")) == "Phaethon"
    assert parse_challenge_nickname({"nick_name": "Fairy"}) == "Fairy"
    assert parse_challenge_nickname({}) == ""


def test_the_roster_endpoint_yields_every_owned_agent_with_its_mindscape() -> None:
    agents = parse_roster_agents(hoyolab_payload("avatar_basic"))

    assert [agent.game_id for agent in agents] == [1041, 1191, 1211, 1131]

    ellen = agents[1]
    assert ellen.name == "Ellen"
    assert ellen.level == 60
    assert ellen.mindscape_level == 2
    assert ellen.rarity == "S"
    assert ellen.element == "202"
    assert ellen.icon.endswith("/1191.png")


def test_an_agent_listed_without_an_id_is_skipped_instead_of_breaking_the_roster() -> None:
    agents = parse_roster_agents(
        {"avatar_list": [{"level": 50, "name_mi18n": "Nameless"}, {"id": 1041}]}
    )

    assert [agent.game_id for agent in agents] == [1041]
    assert agents[0].level == 1
    assert agents[0].name == ""


def test_bangboos_come_back_with_their_letter_rarity_turned_into_the_numeric_scale() -> None:
    bangboos = parse_bangboos(hoyolab_payload("buddy_info"))

    assert [bangboo.game_id for bangboo in bangboos] == [53001, 53101, 53201]
    assert [bangboo.rarity for bangboo in bangboos] == [4, 3, None]

    amillion = bangboos[0]
    assert amillion.name == "Amillion"
    assert amillion.level == 60
    assert amillion.star == 5
    assert amillion.icon.endswith("/53001.png")


def test_a_bangboo_keeps_the_icon_the_real_api_sends() -> None:
    """`bangboo_square_url` is what a browser actually receives, and the only key that matters.

    The other names in `BANGBOO_ICON_KEYS` were guessed before anyone had cookies; with none
    of them matching, every bangboo used to be stored with an empty icon.
    """
    bangboos = parse_bangboos(
        {
            "list": [
                {
                    "id": 54023,
                    "name": "Ariel",
                    "rarity": "S",
                    "level": 60,
                    "star": 1,
                    "bangboo_square_url": "https://act-webstatic.hoyoverse.com/icon/54023.png",
                }
            ]
        }
    )

    assert bangboos[0].icon == "https://act-webstatic.hoyoverse.com/icon/54023.png"


def test_a_bangboo_whose_rarity_already_comes_numeric_keeps_that_number() -> None:
    bangboos = parse_bangboos({"list": [{"id": 53002, "rarity": 3, "name": "Butler"}]})

    assert bangboos[0].rarity == 3
    assert bangboos[0].level == 1
    assert bangboos[0].star == 0
