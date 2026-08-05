from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from zzz_tracker import __version__
from zzz_tracker.errors import ExternalServiceError, NotFoundError, RateLimitedError

DEFAULT_BASE_URL = "https://enka.network/api/zzz"
USER_AGENT = f"zzz-tracker/{__version__} (+https://github.com/zapmaxvevo/personal-zzz)"


@dataclass(frozen=True, slots=True)
class EnkaProfile:
    """A raw Enka showcase response plus the ttl telling us when to ask again."""

    uid: str
    ttl: int
    payload: dict[str, Any]

    @property
    def player_info(self) -> dict[str, Any]:
        info = self.payload.get("PlayerInfo")
        return info if isinstance(info, dict) else {}


class EnkaClient:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        client: httpx.Client | None = None,
        timeout: float = 15.0,
        user_agent: str = USER_AGENT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._user_agent = user_agent
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout)

    def fetch_profile(self, uid: str) -> EnkaProfile:
        url = f"{self.base_url}/uid/{uid}"
        try:
            response = self._client.get(url, headers={"User-Agent": self._user_agent})
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"Could not reach Enka.Network: {exc}") from exc

        self._raise_for_status(uid, response)

        try:
            payload = response.json()
        except ValueError as exc:
            raise ExternalServiceError("Enka.Network returned a malformed response") from exc
        if not isinstance(payload, dict):
            raise ExternalServiceError("Enka.Network returned an unexpected response")

        return EnkaProfile(
            uid=str(payload.get("uid", uid)),
            ttl=int(payload.get("ttl", 0) or 0),
            payload=payload,
        )

    @staticmethod
    def _raise_for_status(uid: str, response: httpx.Response) -> None:
        status = response.status_code
        if status == 200:
            return
        if status in (400, 404):
            raise NotFoundError(f"UID {uid} was not found on Enka.Network")
        if status == 429:
            raise RateLimitedError("Enka.Network rate limited the request; try again later")
        if status == 424:
            raise ExternalServiceError(
                "Enka.Network cannot serve ZZZ data right now (game maintenance)"
            )
        raise ExternalServiceError(f"Enka.Network responded with HTTP {status}")

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> EnkaClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()
