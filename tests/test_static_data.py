from __future__ import annotations

from pathlib import Path

import pytest

from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import NotFoundError


def test_raw_game_ids_resolve_to_localized_names_and_icons(static_data: StaticData) -> None:
    agent = static_data.agent(1041)
    wengine = static_data.wengine(14104)
    disc_set = static_data.disc_set(31000)
    crit_rate = static_data.property(20103)

    assert agent is not None
    assert agent.name == "Soldier 11"
    assert agent.rarity == 4
    assert agent.image_url == "https://enka.network/ui/zzz/IconRole05.png"
    assert wengine is not None
    assert wengine.name == "The Brimstone"
    assert disc_set is not None
    assert disc_set.name == "Woodpecker Electro"
    assert crit_rate is not None
    assert crit_rate.name == "CRIT Rate"


def test_a_disc_piece_knows_its_rarity_and_the_set_it_belongs_to(static_data: StaticData) -> None:
    assert static_data.disc_rarity(31041) == 4
    assert static_data.disc_set_id(31041) == 31000
    assert static_data.disc_set_id(32845) == 32800


def test_unknown_ids_resolve_to_nothing_instead_of_failing(static_data: StaticData) -> None:
    assert static_data.agent(999999) is None
    assert static_data.wengine(999999) is None
    assert static_data.disc_set(999999) is None
    assert static_data.property(999999) is None
    assert static_data.disc_rarity(999999) is None


def test_loading_static_data_that_was_never_downloaded_explains_how_to_get_it(
    tmp_path: Path,
) -> None:
    with pytest.raises(NotFoundError) as exc_info:
        StaticData.from_dir(tmp_path)

    assert "sync-static" in str(exc_info.value)
    assert StaticData.load_optional(tmp_path) is None
