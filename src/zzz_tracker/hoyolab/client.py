from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from zzz_tracker import __version__
from zzz_tracker.errors import (
    CaptchaRequiredError,
    DataNotPublicError,
    ExternalServiceError,
    InvalidCredentialsError,
    RateLimitedError,
)

DEFAULT_BASE_URL = "https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz"
DEFAULT_LANGUAGE = "en-us"
USER_AGENT = f"zzz-tracker/{__version__} (+https://github.com/zapmaxvevo/personal-zzz)"

SCHEDULE_CURRENT = 1
SCHEDULE_PREVIOUS = 2

RETCODE_OK = 0
RETCODES_INVALID_COOKIES = frozenset({-100, 10001})
RETCODES_NOT_PUBLIC = frozenset({10102, 10104})
RETCODES_RATE_LIMITED = frozenset({10101, -110, 1028})
RETCODES_CAPTCHA = frozenset({1034, 10035, 5003, 10041})

ROLE_ID_PARAM = "role_id"
UID_PARAM = "uid"

CLIENT_TYPE = "5"
APP_VERSION = "1.5.0"
REFERER = "https://act.hoyolab.com/"

HTTP_TOO_MANY_REQUESTS = 429


@dataclass(frozen=True, slots=True)
class HoyolabCredentials:
    ltuid_v2: str
    ltoken_v2: str

    def as_cookie_header(self) -> str:
        return f"ltuid_v2={self.ltuid_v2}; ltoken_v2={self.ltoken_v2}"


class HoyolabClient:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        client: httpx.Client | None = None,
        timeout: float = 20.0,
        language: str = DEFAULT_LANGUAGE,
        user_agent: str = USER_AGENT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.language = language
        self._timeout = timeout
        self._user_agent = user_agent
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout)

    def fetch_profile(
        self, uid: str, region: str, credentials: HoyolabCredentials
    ) -> dict[str, Any]:
        return self._get("index", uid, region, credentials, uid_param=ROLE_ID_PARAM)

    def fetch_agents(
        self, uid: str, region: str, credentials: HoyolabCredentials
    ) -> dict[str, Any]:
        return self._get("avatar/basic", uid, region, credentials, uid_param=ROLE_ID_PARAM)

    def fetch_bangboos(
        self, uid: str, region: str, credentials: HoyolabCredentials
    ) -> dict[str, Any]:
        return self._get("buddy/info", uid, region, credentials, uid_param=ROLE_ID_PARAM)

    def fetch_shiyu_defense(
        self,
        uid: str,
        region: str,
        credentials: HoyolabCredentials,
        schedule_type: int = SCHEDULE_CURRENT,
    ) -> dict[str, Any]:
        return self._get(
            "hadal_info_v2",
            uid,
            region,
            credentials,
            uid_param=ROLE_ID_PARAM,
            params={"schedule_type": schedule_type},
        )

    def fetch_deadly_assault(
        self,
        uid: str,
        region: str,
        credentials: HoyolabCredentials,
        schedule_type: int = SCHEDULE_CURRENT,
    ) -> dict[str, Any]:
        return self._get(
            "hadal_mem_detail_v2",
            uid,
            region,
            credentials,
            uid_param=UID_PARAM,
            params={"schedule_type": schedule_type},
        )

    def fetch_lost_void(
        self, uid: str, region: str, credentials: HoyolabCredentials
    ) -> dict[str, Any]:
        return self._get("abysss2_abstract", uid, region, credentials, uid_param=UID_PARAM)

    def _get(
        self,
        path: str,
        uid: str,
        region: str,
        credentials: HoyolabCredentials,
        uid_param: str = UID_PARAM,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        region_param = "server" if uid_param == ROLE_ID_PARAM else "region"
        query: dict[str, Any] = {uid_param: uid, region_param: region}
        query.update(params or {})

        try:
            response = self._client.get(
                f"{self.base_url}/{path}",
                params=query,
                headers=self._headers(credentials),
            )
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"Could not reach HoYoLAB: {exc}") from exc

        if response.status_code == HTTP_TOO_MANY_REQUESTS:
            raise RateLimitedError(
                f"HoYoLAB throttled the request with HTTP {HTTP_TOO_MANY_REQUESTS}"
            )
        if response.status_code != 200:
            raise ExternalServiceError(f"HoYoLAB responded with HTTP {response.status_code}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise ExternalServiceError("HoYoLAB returned a malformed response") from exc
        if not isinstance(payload, dict):
            raise ExternalServiceError("HoYoLAB returned an unexpected response")

        self._raise_for_retcode(uid, payload)

        data = payload.get("data")
        return data if isinstance(data, dict) else {}

    def _headers(self, credentials: HoyolabCredentials) -> dict[str, str]:
        return {
            "Cookie": credentials.as_cookie_header(),
            "User-Agent": self._user_agent,
            "Referer": REFERER,
            "x-rpc-lang": self.language,
            "x-rpc-language": self.language,
            "x-rpc-client_type": CLIENT_TYPE,
            "x-rpc-app_version": APP_VERSION,
        }

    @staticmethod
    def _raise_for_retcode(uid: str, payload: dict[str, Any]) -> None:
        retcode = payload.get("retcode")
        if retcode == RETCODE_OK:
            return

        message = str(payload.get("message") or "").strip()
        reported = f" ({message})" if message else ""
        if retcode in RETCODES_INVALID_COOKIES:
            raise InvalidCredentialsError(
                f"HoYoLAB rejected the stored cookies; they have to be pasted again{reported}"
            )
        if retcode in RETCODES_NOT_PUBLIC:
            raise DataNotPublicError(f"UID {uid} does not share this record publicly{reported}")
        if retcode in RETCODES_RATE_LIMITED:
            raise RateLimitedError(f"HoYoLAB is throttling the tracker; try again later{reported}")
        if retcode in RETCODES_CAPTCHA:
            raise CaptchaRequiredError(
                f"HoYoLAB is asking for a captcha, which the tracker cannot solve{reported}"
            )
        raise ExternalServiceError(f"HoYoLAB refused the request (retcode {retcode}): {message}")

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> HoyolabClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()
