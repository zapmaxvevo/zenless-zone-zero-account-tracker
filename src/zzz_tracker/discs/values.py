"""Turn the base values Enka serves into the numbers the game actually shows.

Enka never sends a displayed value. Its own docs spell out what the two fields mean:
`PropertyValue` is the *base* and `PropertyLevel` is the *roll count* ("Amount of rolls, only
matters if substat"). So both stats need reconstructing, each by its own rule:

- a **main stat** grows with the disc level, `base * (1 + scale / 10000)`, where the scale comes
  from a table indexed by rarity and level and tops out at `30000` -- `x4.0` -- for all three
  rarities, each at its own max level;
- a **substat** is `base * rolls`, flat, because every roll of a given stat on a given rarity
  adds exactly the same amount. ZZZ has no per-roll random range, unlike Genshin or HSR.

That last property is what lets the tracker count rolls instead of measuring values.

The tables below are the game's own, read from `RandPropertyLibraryTemplateTb` (substat bases,
one library per rarity) and `EquipmentLevelTemplateTb` (main stat scales). Enka's store publishes
neither, so they are vendored here.

Percentage properties are stored at 100x, the same scale Enka uses everywhere else: CRIT DMG
`480` is 4.8%.
"""

from __future__ import annotations

RARITY_S = 4
RARITY_A = 3
RARITY_B = 2

# What one roll of a substat adds, per rarity. A stat missing from a rarity cannot roll there.
SUBSTAT_BASE: dict[int, dict[int, int]] = {
    RARITY_S: {
        11102: 300,  # HP%
        11103: 112,  # HP
        12102: 300,  # ATK%
        12103: 19,  # ATK
        13102: 480,  # DEF%
        13103: 15,  # DEF
        20103: 240,  # CRIT Rate
        21103: 480,  # CRIT DMG
        23203: 9,  # PEN
        31203: 9,  # Anomaly Proficiency
    },
    RARITY_A: {
        11102: 200,
        11103: 75,
        12102: 200,
        12103: 13,
        13102: 320,
        13103: 10,
        20103: 160,
        21103: 320,
        23203: 6,
        31203: 6,
    },
    RARITY_B: {
        11102: 100,
        11103: 37,
        12102: 100,
        12103: 6,
        13102: 160,
        13103: 5,
        20103: 80,
        21103: 160,
        23203: 3,
        31203: 3,
    },
}

# Main stat growth per rarity, indexed by disc level. The last entry of each row is the cap.
MAIN_STAT_SCALE: dict[int, tuple[int, ...]] = {
    RARITY_S: (
        0,
        2000,
        4000,
        6000,
        8000,
        10000,
        12000,
        14000,
        16000,
        18000,
        20000,
        22000,
        24000,
        26000,
        28000,
        30000,
    ),
    RARITY_A: (0, 2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000, 22500, 25000, 27500, 30000),
    RARITY_B: (0, 3333, 6667, 10000, 13333, 16667, 20000, 23333, 26667, 30000),
}

# Highest level a disc reaches, per rarity. One substat proc every three levels.
MAX_DISC_LEVEL: dict[int, int] = {
    rarity: len(scale) - 1 for rarity, scale in MAIN_STAT_SCALE.items()
}
LEVELS_PER_PROC = 3

# A disc drops with three or four substats and caps at four. Every proc adds exactly one to the
# disc's total roll count, whether it upgrades a substat or creates the fourth one, so a single
# substat only reaches `MAX_SUBSTAT_ROLLS` on a disc that dropped with four.
MIN_SUBSTATS = 3
MAX_SUBSTATS = 4
MAX_SUBSTAT_ROLLS = 6


def procs_for(rarity: int) -> int | None:
    """How many substat procs a disc of this rarity gets from level 0 to its cap: S 5, A 4, B 3."""
    max_level = MAX_DISC_LEVEL.get(rarity)
    return None if max_level is None else max_level // LEVELS_PER_PROC


def substat_base(prop_id: int, rarity: int) -> int | None:
    """What one roll of `prop_id` is worth on a disc of this rarity, or None if it cannot roll."""
    return SUBSTAT_BASE.get(rarity, {}).get(prop_id)


def substat_total(base: int, rolls: int) -> int:
    """The value the game shows for a substat: every roll adds the same `base`."""
    return base * rolls


def main_stat_total(base: int, rarity: int | None, level: int) -> int | None:
    """The value the game shows for a main stat, or None when rarity or level are out of range.

    Returning None rather than the unscaled base keeps a missing rarity visible instead of
    quietly passing a level-0 value off as the real one.
    """
    if rarity is None:
        return None
    scale = MAIN_STAT_SCALE.get(rarity)
    if scale is None or not 0 <= level < len(scale):
        return None
    return base * (10000 + scale[level]) // 10000
