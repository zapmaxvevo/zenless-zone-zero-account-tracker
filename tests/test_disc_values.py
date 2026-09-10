from __future__ import annotations

import pytest

from zzz_tracker.discs.values import (
    MAIN_STAT_SCALE,
    MAX_SUBSTAT_ROLLS,
    RARITY_A,
    RARITY_B,
    RARITY_S,
    SUBSTAT_BASE,
    main_stat_total,
    procs_for,
    substat_base,
    substat_total,
)


def test_a_main_stat_grows_with_the_disc_level() -> None:
    # The worked example in Enka's own docs: a 550 base at level 14 reads 2090 in game.
    assert main_stat_total(550, RARITY_S, 14) == 2090
    assert main_stat_total(550, RARITY_S, 0) == 550
    assert main_stat_total(550, RARITY_S, 15) == 2200


@pytest.mark.parametrize(
    ("base", "expected"),
    [
        (600, 2400),  # CRIT Rate main, 24%
        (1200, 4800),  # CRIT DMG main, 48%
        (750, 3000),  # ATK% main, 30%
        (23, 92),  # Anomaly Proficiency main
    ],
)
def test_every_main_stat_quadruples_at_the_level_cap(base: int, expected: int) -> None:
    assert main_stat_total(base, RARITY_S, 15) == expected


def test_the_three_rarities_reach_the_same_cap_at_their_own_max_level() -> None:
    assert main_stat_total(100, RARITY_S, 15) == 400
    assert main_stat_total(100, RARITY_A, 12) == 400
    assert main_stat_total(100, RARITY_B, 9) == 400


def test_a_main_stat_past_its_rarity_max_level_has_no_value() -> None:
    # B discs stop at 9; asking for a level they cannot reach is a bug, not a maxed disc.
    assert main_stat_total(550, RARITY_B, 15) is None
    assert main_stat_total(550, RARITY_S, 16) is None
    assert main_stat_total(550, RARITY_S, -1) is None


def test_a_main_stat_without_a_known_rarity_has_no_value() -> None:
    # Better an absent value than the unscaled base passed off as the real one.
    assert main_stat_total(550, None, 15) is None
    assert main_stat_total(550, 9, 15) is None


def test_every_roll_of_a_substat_adds_the_same_amount() -> None:
    # 4.8% CRIT DMG per roll on an S disc, with no per-roll range to average out.
    assert substat_total(480, 1) == 480
    assert substat_total(480, 3) == 1440
    assert substat_total(480, MAX_SUBSTAT_ROLLS) == 2880


def test_a_substat_is_worth_less_on_a_lower_rarity() -> None:
    assert substat_base(21103, RARITY_S) == 480  # CRIT DMG 4.8%
    assert substat_base(21103, RARITY_A) == 320  # 3.2%
    assert substat_base(21103, RARITY_B) == 160  # 1.6%


def test_a_crit_rate_roll_and_a_crit_dmg_roll_are_worth_the_same() -> None:
    # 2.4% CRIT Rate against 4.8% CRIT DMG: exactly the 1:2 ratio, so both weigh 1 when
    # the tracker counts rolls instead of measuring values.
    assert substat_base(21103, RARITY_S) == 2 * (substat_base(20103, RARITY_S) or 0)


def test_a_stat_that_cannot_roll_has_no_base() -> None:
    assert substat_base(30502, RARITY_S) is None  # Energy Regen is main stat only
    assert substat_base(21103, 9) is None


def test_a_disc_gets_one_substat_proc_every_three_levels() -> None:
    assert procs_for(RARITY_S) == 5
    assert procs_for(RARITY_A) == 4
    assert procs_for(RARITY_B) == 3
    assert procs_for(9) is None


def test_the_three_rarities_offer_the_same_substats() -> None:
    pools = [set(SUBSTAT_BASE[rarity]) for rarity in (RARITY_S, RARITY_A, RARITY_B)]
    assert pools[0] == pools[1] == pools[2]
    assert len(pools[0]) == 10


def test_a_scale_row_covers_every_level_from_zero_to_the_cap() -> None:
    assert [len(scale) for scale in MAIN_STAT_SCALE.values()] == [16, 13, 10]
    for scale in MAIN_STAT_SCALE.values():
        assert scale[0] == 0
        assert scale[-1] == 30000
        assert list(scale) == sorted(scale)
