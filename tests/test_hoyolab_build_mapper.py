from __future__ import annotations

import json
from typing import Any

import pytest

from zzz_tracker.enka.mapper import ParsedAgent, ParsedStat
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.hoyolab.build_mapper import parse_agent_builds, raw_agents

from .conftest import FIXTURES_DIR

MIYABI = 1091
BURNICE = 1451

# What Enka stored for the same six agents, read from the tracker's own database once and
# frozen here: the whole point of the mapper is that the Battle Chronicle lands on these very
# numbers. `skills` is `{skill_type: level}`, and every disc is
# `(slot, game_id, set_id, level, roll_count, ((prop_id, value, rolls), ...))`.
ENKA_BUILDS: dict[int, dict[str, Any]] = {
    1091: {
        "skills": {"0": 12, "1": 12, "2": 7, "3": 12, "5": 7, "6": 8},
        "core": 6,
        "mindscape": 0,
        "wengine": (14109, 60, 1, 5),
        "discs": [
            (
                1,
                32741,
                32700,
                15,
                5,
                ((23203, 9, 1), (12103, 19, 2), (20103, 240, 2), (11102, 300, 3)),
            ),
            (
                2,
                32742,
                32700,
                15,
                5,
                ((23203, 9, 3), (21103, 480, 2), (20103, 240, 2), (11103, 112, 1)),
            ),
            (
                3,
                31043,
                31000,
                15,
                5,
                ((21103, 480, 1), (11103, 112, 4), (11102, 300, 1), (20103, 240, 3)),
            ),
            (
                4,
                32744,
                32700,
                15,
                5,
                ((12102, 300, 4), (11102, 300, 1), (13103, 15, 2), (13102, 480, 1)),
            ),
            (
                5,
                31045,
                31000,
                15,
                5,
                ((31203, 9, 1), (12103, 19, 4), (20103, 240, 2), (12102, 300, 1)),
            ),
            (
                6,
                32746,
                32700,
                15,
                5,
                ((11102, 300, 1), (20103, 240, 2), (21103, 480, 3), (12103, 19, 2)),
            ),
        ],
    },
    1311: {
        "skills": {"0": 12, "1": 12, "2": 7, "3": 12, "5": 7, "6": 7},
        "core": 6,
        "mindscape": 0,
        "wengine": (14131, 60, 1, 5),
        "discs": [
            (
                1,
                32841,
                32800,
                15,
                5,
                ((31203, 9, 2), (13103, 15, 2), (12103, 19, 3), (12102, 300, 2)),
            ),
            (
                2,
                32842,
                32800,
                15,
                5,
                ((21103, 480, 1), (20103, 240, 3), (11102, 300, 1), (13102, 480, 3)),
            ),
            (
                3,
                31643,
                31600,
                15,
                5,
                ((12102, 300, 2), (21103, 480, 2), (23203, 9, 3), (12103, 19, 1)),
            ),
            (4, 32844, 32800, 0, 0, ((12103, 19, 1), (21103, 480, 1), (20103, 240, 1))),
            (
                5,
                31645,
                31600,
                15,
                5,
                ((13103, 15, 1), (21103, 480, 1), (12103, 19, 3), (23203, 9, 3)),
            ),
            (6, 32846, 32800, 0, 0, ((13102, 480, 1), (11102, 300, 1), (23203, 9, 1))),
        ],
    },
    1321: {
        "skills": {"0": 12, "1": 12, "2": 11, "3": 12, "5": 7, "6": 12},
        "core": 6,
        "mindscape": 0,
        "wengine": (14132, 60, 1, 5),
        "discs": [
            (
                1,
                31041,
                31000,
                15,
                5,
                ((23203, 9, 3), (20103, 240, 1), (31203, 9, 3), (13103, 15, 2)),
            ),
            (
                2,
                31042,
                31000,
                15,
                5,
                ((20103, 240, 2), (21103, 480, 2), (13103, 15, 3), (13102, 480, 1)),
            ),
            (
                3,
                32743,
                32700,
                15,
                5,
                ((11103, 112, 2), (21103, 480, 4), (20103, 240, 1), (12102, 300, 1)),
            ),
            (
                4,
                32744,
                32700,
                15,
                5,
                ((23203, 9, 3), (21103, 480, 2), (12103, 19, 2), (11103, 112, 2)),
            ),
            (
                5,
                31045,
                31000,
                15,
                5,
                ((12103, 19, 2), (13103, 15, 2), (11102, 300, 2), (13102, 480, 2)),
            ),
            (
                6,
                31046,
                31000,
                15,
                5,
                ((11102, 300, 2), (31203, 9, 3), (21103, 480, 2), (13103, 15, 1)),
            ),
        ],
    },
    1371: {
        "skills": {"0": 12, "1": 12, "2": 7, "3": 12, "5": 7, "6": 7},
        "core": 6,
        "mindscape": 0,
        "wengine": (14137, 60, 1, 5),
        "discs": [
            (
                1,
                33141,
                33100,
                15,
                5,
                ((20103, 240, 3), (13103, 15, 2), (21103, 480, 1), (13102, 480, 2)),
            ),
            (
                2,
                32742,
                32700,
                15,
                5,
                ((11102, 300, 2), (20103, 240, 3), (12102, 300, 2), (11103, 112, 2)),
            ),
            (
                3,
                32743,
                32700,
                15,
                5,
                ((12103, 19, 1), (11103, 112, 1), (20103, 240, 2), (11102, 300, 4)),
            ),
            (
                4,
                33144,
                33100,
                15,
                5,
                ((12103, 19, 2), (11103, 112, 2), (21103, 480, 3), (13103, 15, 1)),
            ),
            (
                5,
                33145,
                33100,
                15,
                5,
                ((13102, 480, 3), (20103, 240, 1), (12102, 300, 2), (12103, 19, 2)),
            ),
            (
                6,
                33146,
                33100,
                15,
                5,
                ((12102, 300, 2), (23203, 9, 2), (12103, 19, 2), (11103, 112, 2)),
            ),
        ],
    },
    1431: {
        "skills": {"0": 12, "1": 12, "2": 8, "3": 12, "5": 7, "6": 11},
        "core": 6,
        "mindscape": 0,
        "wengine": (14143, 60, 1, 5),
        "discs": [
            (
                1,
                32741,
                32700,
                15,
                5,
                ((13103, 15, 1), (31203, 9, 4), (21103, 480, 3), (20103, 240, 1)),
            ),
            (
                2,
                32742,
                32700,
                15,
                5,
                ((21103, 480, 2), (20103, 240, 1), (13102, 480, 3), (12102, 300, 3)),
            ),
            (
                3,
                33543,
                33500,
                15,
                5,
                ((21103, 480, 2), (20103, 240, 2), (12102, 300, 1), (12103, 19, 3)),
            ),
            (
                4,
                33544,
                33500,
                15,
                5,
                ((20103, 240, 2), (12103, 19, 1), (11102, 300, 2), (13102, 480, 3)),
            ),
            (
                5,
                33545,
                33500,
                15,
                5,
                ((12103, 19, 1), (12102, 300, 2), (20103, 240, 3), (31203, 9, 2)),
            ),
            (
                6,
                33546,
                33500,
                15,
                5,
                ((21103, 480, 4), (20103, 240, 2), (31203, 9, 1), (23203, 9, 1)),
            ),
        ],
    },
    1451: {
        "skills": {"0": 7, "1": 12, "2": 1, "3": 8, "5": 7, "6": 7},
        "core": 6,
        "mindscape": 0,
        "wengine": (14145, 60, 1, 5),
        "discs": [
            (1, 33431, 33400, 0, 0, ((12102, 200, 1), (11102, 200, 1))),
            (
                2,
                33442,
                33400,
                15,
                5,
                ((20103, 240, 2), (11103, 112, 2), (11102, 300, 2), (13102, 480, 2)),
            ),
            (3, 33133, 33100, 0, 0, ((11103, 75, 1), (11102, 200, 1), (23203, 6, 1))),
            (
                4,
                33444,
                33400,
                15,
                5,
                ((11103, 112, 2), (12103, 19, 2), (20103, 240, 1), (23203, 9, 3)),
            ),
            (5, 33435, 33400, 0, 0, ((11103, 75, 1), (11102, 200, 1))),
            (
                6,
                33146,
                33100,
                15,
                5,
                ((11103, 112, 2), (23203, 9, 3), (13103, 15, 1), (12102, 300, 2)),
            ),
        ],
    },
}


@pytest.fixture
def avatar_info() -> list[dict[str, Any]]:
    raw = (FIXTURES_DIR / "hoyolab_avatar_info.json").read_text(encoding="utf-8")
    payloads: list[dict[str, Any]] = json.loads(raw)
    return payloads


@pytest.fixture
def builds(avatar_info: list[dict[str, Any]], static_data: StaticData) -> dict[int, ParsedAgent]:
    return {build.game_id: build for build in parse_agent_builds(avatar_info, static_data)}


def substats_of(build: ParsedAgent, slot: int) -> tuple[tuple[int, int, int], ...]:
    disc = next(disc for disc in build.discs if disc.slot == slot)
    return tuple((stat.prop_id, stat.value, stat.rolls) for stat in disc.substats)


def test_every_agent_the_chronicle_answered_for_comes_back_as_a_build(
    builds: dict[int, ParsedAgent],
) -> None:
    assert sorted(builds) == [1091, 1311, 1321, 1371, 1431, 1451]
    for build in builds.values():
        assert build.level == 60
        assert len(build.discs) == 6
        assert build.wengine is not None


def test_a_build_reads_the_agent_the_way_the_showcase_does(builds: dict[int, ParsedAgent]) -> None:
    miyabi = builds[MIYABI]

    assert miyabi.skill_levels == {"0": 12, "1": 12, "2": 7, "3": 12, "5": 7, "6": 8}
    assert miyabi.core_skill_enhancement == 6
    assert miyabi.mindscape_level == 0
    assert miyabi.promotion_level == 6
    assert miyabi.weapon_effect_state is None
    assert miyabi.obtained_at is None


def test_the_wengine_keeps_its_phase_and_derives_the_modification_it_never_sends(
    builds: dict[int, ParsedAgent],
) -> None:
    wengine = builds[MIYABI].wengine

    assert wengine is not None
    assert (wengine.game_id, wengine.level, wengine.phase) == (14109, 60, 1)
    assert wengine.modification_level == 5
    assert wengine.item_uid is None


def test_a_disc_names_its_set_and_counts_a_roll_every_three_levels(
    builds: dict[int, ParsedAgent],
) -> None:
    disc = next(disc for disc in builds[MIYABI].discs if disc.slot == 1)

    assert (disc.game_id, disc.set_id, disc.rarity) == (32741, 32700, 4)
    assert (disc.level, disc.roll_count) == (15, 5)
    assert disc.item_uid is None


def test_an_unlevelled_disc_has_no_rolls_behind_it(builds: dict[int, ParsedAgent]) -> None:
    disc = next(disc for disc in builds[BURNICE].discs if disc.slot == 1)

    assert (disc.game_id, disc.level, disc.roll_count) == (33431, 0, 0)
    assert disc.rarity == 3


def test_a_substat_is_stored_as_the_step_of_a_single_roll(
    builds: dict[int, ParsedAgent],
) -> None:
    disc = next(disc for disc in builds[MIYABI].discs if disc.slot == 1)

    # HoYoLAB sends "38" ATK over 2 rolls and "4.8%" CRIT Rate over 2, both accumulated.
    assert ParsedStat(prop_id=12103, value=19, rolls=2) in disc.substats
    assert ParsedStat(prop_id=20103, value=240, rolls=2) in disc.substats


def test_the_main_stat_is_read_whole_since_no_roll_went_into_it(
    builds: dict[int, ParsedAgent],
) -> None:
    disc = next(disc for disc in builds[MIYABI].discs if disc.slot == 1)

    assert disc.main_stat == ParsedStat(prop_id=11103, value=2200, rolls=0)


@pytest.mark.parametrize("game_id", sorted(ENKA_BUILDS))
def test_the_chronicle_build_matches_the_one_enka_had_already_stored(
    builds: dict[int, ParsedAgent], game_id: int
) -> None:
    expected = ENKA_BUILDS[game_id]
    build = builds[game_id]

    assert build.skill_levels == expected["skills"]
    assert build.core_skill_enhancement == expected["core"]
    assert build.mindscape_level == expected["mindscape"]

    wengine = build.wengine
    assert wengine is not None
    assert (
        wengine.game_id,
        wengine.level,
        wengine.phase,
        wengine.modification_level,
    ) == expected["wengine"]

    discs = [
        (
            disc.slot,
            disc.game_id,
            disc.set_id,
            disc.level,
            disc.roll_count,
            substats_of(build, disc.slot),
        )
        for disc in sorted(build.discs, key=lambda disc: disc.slot)
    ]
    assert discs == expected["discs"]


def test_the_mapper_answers_without_static_data(avatar_info: list[dict[str, Any]]) -> None:
    """The set comes with the payload, so only the rarity would need the static data."""
    builds = {build.game_id: build for build in parse_agent_builds(avatar_info)}

    disc = next(disc for disc in builds[MIYABI].discs if disc.slot == 1)
    assert disc.set_id == 32700
    assert disc.rarity == 4


def test_payloads_that_come_broken_are_skipped_instead_of_breaking_the_import(
    static_data: StaticData,
) -> None:
    payloads: list[dict[str, Any]] = [
        {},
        {"avatar_list": "junk"},
        {"avatar_list": [{"level": 60}]},
        {
            "avatar_list": [
                {
                    "id": 1191,
                    "level": 50,
                    "rank": 2,
                    "skills": [{"skill_type": 5, "level": 4}, {"level": 9}],
                    "weapon": None,
                    "equip": [{"level": 9}, {"id": 31041, "equipment_type": 1}],
                }
            ]
        },
    ]

    builds = parse_agent_builds(payloads, static_data)

    assert len(builds) == 1
    build = builds[0]
    assert build.game_id == 1191
    assert build.wengine is None
    assert build.core_skill_enhancement == 3
    assert build.skill_levels == {"5": 4}
    assert [disc.game_id for disc in build.discs] == [31041]
    assert build.discs[0].substats == ()
    assert build.discs[0].main_stat is None


def test_an_agent_without_a_core_skill_reports_no_enhancement(static_data: StaticData) -> None:
    payloads = [{"avatar_list": [{"id": 1191, "level": 50, "skills": [{"skill_type": 0}]}]}]

    build = parse_agent_builds(payloads, static_data)[0]

    assert build.core_skill_enhancement == 0
    assert build.promotion_level == 5


def test_the_raw_entries_are_the_ones_the_snapshots_keep(
    avatar_info: list[dict[str, Any]],
) -> None:
    entries = raw_agents(avatar_info)

    assert [game_id for game_id, _ in entries] == [1091, 1311, 1321, 1371, 1431, 1451]
    assert entries[0][1] is avatar_info[0]["avatar_list"][0]
