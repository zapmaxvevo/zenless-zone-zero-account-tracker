from __future__ import annotations

from typing import Any

import httpx
import pytest

from zzz_tracker.enka.client import USER_AGENT, EnkaClient
from zzz_tracker.errors import ExternalServiceError, NotFoundError, RateLimitedError

BASE_URL = "https://enka.test/api/zzz"
UID = "1300000001"


def client_returning(response: httpx.Response) -> tuple[EnkaClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return response

    transport = httpx.MockTransport(handler)
    return EnkaClient(base_url=BASE_URL, client=httpx.Client(transport=transport)), seen


def test_the_showcase_is_requested_by_uid_with_an_identifiable_user_agent(
    enka_payload: dict[str, Any],
) -> None:
    client, seen = client_returning(httpx.Response(200, json=enka_payload))

    profile = client.fetch_profile(UID)

    assert str(seen[0].url) == f"{BASE_URL}/uid/{UID}"
    assert seen[0].headers["User-Agent"] == USER_AGENT
    assert "zzz-tracker" in USER_AGENT
    assert profile.uid == UID
    assert profile.ttl == 60
    assert profile.player_info["SocialDetail"]["ProfileDetail"]["Nickname"] == "Phaethon"


def test_an_unreachable_enka_is_reported_as_an_upstream_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = EnkaClient(
        base_url=BASE_URL, client=httpx.Client(transport=httpx.MockTransport(handler))
    )

    with pytest.raises(ExternalServiceError):
        client.fetch_profile(UID)


def test_a_response_that_is_not_json_is_reported_as_an_upstream_failure() -> None:
    client, _ = client_returning(httpx.Response(200, text="<html>gateway error</html>"))

    with pytest.raises(ExternalServiceError):
        client.fetch_profile(UID)


@pytest.mark.parametrize("status_code", [400, 404])
def test_a_uid_enka_does_not_know_is_reported_as_not_found(status_code: int) -> None:
    client, _ = client_returning(httpx.Response(status_code, json={}))

    with pytest.raises(NotFoundError) as exc_info:
        client.fetch_profile(UID)

    assert UID in str(exc_info.value)


def test_being_throttled_by_enka_is_reported_as_rate_limited() -> None:
    client, _ = client_returning(httpx.Response(429, json={}))

    with pytest.raises(RateLimitedError):
        client.fetch_profile(UID)


@pytest.mark.parametrize("status_code", [424, 500, 503])
def test_any_other_enka_failure_is_reported_as_an_upstream_failure(status_code: int) -> None:
    client, _ = client_returning(httpx.Response(status_code, json={}))

    with pytest.raises(ExternalServiceError):
        client.fetch_profile(UID)
