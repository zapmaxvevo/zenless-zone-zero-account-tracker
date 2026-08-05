from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from zzz_tracker.errors import ExternalServiceError, NotFoundError

STORE_BASE_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/zzz"
ASSET_BASE_URL = "https://enka.network"
DEFAULT_LANGUAGE = "en"

STATIC_FILES = (
    "avatars.json",
    "weapons.json",
    "equipments.json",
    "property.json",
    "locs.json",
)


def asset_url(path: str | None) -> str | None:
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{ASSET_BASE_URL}{path}"


@dataclass(frozen=True, slots=True)
class AgentInfo:
    game_id: int
    name: str
    rarity: int | None
    profession: str | None
    elements: tuple[str, ...]
    image_url: str | None
    circle_icon_url: str | None


@dataclass(frozen=True, slots=True)
class WEngineInfo:
    game_id: int
    name: str
    rarity: int | None
    profession: str | None
    image_url: str | None


@dataclass(frozen=True, slots=True)
class DiscSetInfo:
    suit_id: int
    name: str
    icon_url: str | None
    set_bonus: dict[str, int]


@dataclass(frozen=True, slots=True)
class PropertyInfo:
    property_id: int
    name: str
    format: str


class StaticData:
    """Enka's parsed store files, used to turn raw game ids into names and icons."""

    def __init__(
        self,
        avatars: dict[str, Any],
        weapons: dict[str, Any],
        equipments: dict[str, Any],
        properties: dict[str, Any],
        locs: dict[str, Any],
        language: str = DEFAULT_LANGUAGE,
    ) -> None:
        self._avatars = avatars
        self._weapons = weapons
        self._disc_items: dict[str, Any] = equipments.get("Items", {})
        self._disc_suits: dict[str, Any] = equipments.get("Suits", {})
        self._properties = properties
        self._locs = locs
        self.language = language
        self._texts: dict[str, str] = locs.get(language, {})

    @classmethod
    def from_dir(cls, directory: str | Path, language: str = DEFAULT_LANGUAGE) -> StaticData:
        base = Path(directory)
        payloads: dict[str, Any] = {}
        for filename in STATIC_FILES:
            path = base / filename
            if not path.exists():
                raise NotFoundError(
                    f"Static data file {filename} is missing from {base}; "
                    "run `zzz-tracker sync-static` first"
                )
            payloads[filename] = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            avatars=payloads["avatars.json"],
            weapons=payloads["weapons.json"],
            equipments=payloads["equipments.json"],
            properties=payloads["property.json"],
            locs=payloads["locs.json"],
            language=language,
        )

    @classmethod
    def load_optional(
        cls, directory: str | Path, language: str = DEFAULT_LANGUAGE
    ) -> StaticData | None:
        """Load the static data, or None when it has not been downloaded yet."""
        try:
            return cls.from_dir(directory, language)
        except (NotFoundError, ValueError):
            return None

    @property
    def languages(self) -> tuple[str, ...]:
        return tuple(self._locs)

    def translate(self, key: str | None) -> str:
        if not key:
            return ""
        return self._texts.get(key, key)

    def agent(self, game_id: int) -> AgentInfo | None:
        entry = self._avatars.get(str(game_id))
        if entry is None:
            return None
        return AgentInfo(
            game_id=game_id,
            name=self.translate(entry.get("Name")),
            rarity=entry.get("Rarity"),
            profession=entry.get("ProfessionType"),
            elements=tuple(entry.get("ElementTypes", [])),
            image_url=asset_url(entry.get("Image")),
            circle_icon_url=asset_url(entry.get("CircleIcon")),
        )

    def wengine(self, game_id: int) -> WEngineInfo | None:
        entry = self._weapons.get(str(game_id))
        if entry is None:
            return None
        return WEngineInfo(
            game_id=game_id,
            name=self.translate(entry.get("ItemName")),
            rarity=entry.get("Rarity"),
            profession=entry.get("ProfessionType"),
            image_url=asset_url(entry.get("ImagePath")),
        )

    def disc_rarity(self, game_id: int) -> int | None:
        entry = self._disc_items.get(str(game_id))
        return None if entry is None else entry.get("Rarity")

    def disc_suit_id(self, game_id: int) -> int | None:
        entry = self._disc_items.get(str(game_id))
        return None if entry is None else entry.get("SuitId")

    def disc_set(self, suit_id: int) -> DiscSetInfo | None:
        entry = self._disc_suits.get(str(suit_id))
        if entry is None:
            return None
        return DiscSetInfo(
            suit_id=suit_id,
            name=self.translate(entry.get("Name")),
            icon_url=asset_url(entry.get("Icon")),
            set_bonus=dict(entry.get("SetBonusProps", {})),
        )

    def property(self, property_id: int) -> PropertyInfo | None:
        entry = self._properties.get(str(property_id))
        if entry is None:
            return None
        return PropertyInfo(
            property_id=property_id,
            name=self.translate(entry.get("Name")),
            format=entry.get("Format", "{0:0}"),
        )

    def agent_ids(self) -> tuple[int, ...]:
        return tuple(sorted(int(key) for key in self._avatars))

    def wengine_ids(self) -> tuple[int, ...]:
        return tuple(sorted(int(key) for key in self._weapons))

    def disc_set_ids(self) -> tuple[int, ...]:
        return tuple(sorted(int(key) for key in self._disc_suits))

    def property_ids(self) -> tuple[int, ...]:
        return tuple(sorted(int(key) for key in self._properties))


def download_static_data(
    target_dir: str | Path,
    base_url: str = STORE_BASE_URL,
    client: httpx.Client | None = None,
    timeout: float = 60.0,
) -> list[Path]:
    """Download Enka's store files into `target_dir`, returning the written paths."""
    destination = Path(target_dir)
    destination.mkdir(parents=True, exist_ok=True)
    owns_client = client is None
    http = client or httpx.Client(timeout=timeout)
    written: list[Path] = []
    try:
        for filename in STATIC_FILES:
            url = f"{base_url.rstrip('/')}/{filename}"
            try:
                response = http.get(url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ExternalServiceError(f"Failed to download {url}: {exc}") from exc
            path = destination / filename
            path.write_bytes(response.content)
            written.append(path)
    finally:
        if owns_client:
            http.close()
    return written
