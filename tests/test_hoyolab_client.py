from __future__ import annotations

from typing import Any

import httpx
import pytest

from zzz_tracker.errors import (
    CaptchaRequiredError,
    DataNotPublicError,
    ExternalServiceError,
    InvalidCredentialsError,
    RateLimitedError,
    ZZZTrackerError,
)
from zzz_tracker.hoyolab.client import (
    SCHEDULE_PREVIOUS,
    USER_AGENT,
    HoyolabClient,
    HoyolabCredentials,
)

BASE_URL = "https://hoyolab.test/event/game_record_zzz/api/zzz"
UID = "1300000001"
REGION = "prod_gf_us"
CREDENTIALS = HoyolabCredentials(ltuid_v2="42", ltoken_v2="v2_secret")

ROLE_ID_ENDPOINTS = [
    ("fetch_profile", "index"),
    ("fetch_agents", "avatar/basic"),
    ("fetch_bangboos", "buddy/info"),
    ("fetch_shiyu_defense", "hadal_info_v2"),
]
UID_ENDPOINTS = [
    ("fetch_deadly_assault", "hadal_mem_detail_v2"),
    ("fetch_lost_void", "abysss2_abstract"),
]
EVERY_ENDPOINT = ROLE_ID_ENDPOINTS + UID_ENDPOINTS
SCHEDULED_ENDPOINTS = ["fetch_shiyu_defense", "fetch_deadly_assault"]

HOYOLAB_MESSAGE = "Please verify your account to continue"
MAPPED_FAILURES: list[tuple[int, type[ZZZTrackerError]]] = [
    (-100, InvalidCredentialsError),
    (10001, InvalidCredentialsError),
    (10102, DataNotPublicError),
    (10104, DataNotPublicError),
    (10101, RateLimitedError),
    (-110, RateLimitedError),
    (1028, RateLimitedError),
    (1034, CaptchaRequiredError),
    (10035, CaptchaRequiredError),
    (5003, CaptchaRequiredError),
    (10041, CaptchaRequiredError),
]


def client_returning(
    response: httpx.Response, **kwargs: Any
) -> tuple[HoyolabClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return response

    transport = httpx.MockTransport(handler)
    client = HoyolabClient(base_url=BASE_URL, client=httpx.Client(transport=transport), **kwargs)
    return client, seen


def chronicle_response(**payload: Any) -> httpx.Response:
    return httpx.Response(200, json=payload)


def fetch(client: HoyolabClient, method_name: str, **kwargs: Any) -> dict[str, Any]:
    method = getattr(client, method_name)
    result: dict[str, Any] = method(UID, REGION, CREDENTIALS, **kwargs)
    return result


@pytest.mark.parametrize(("method_name", "path"), EVERY_ENDPOINT)
def test_every_chronicle_endpoint_is_asked_for_its_own_path_and_answers_with_its_data(
    method_name: str, path: str
) -> None:
    client, seen = client_returning(
        chronicle_response(retcode=0, message="OK", data={"nickname": "Phaethon"})
    )

    data = fetch(client, method_name)

    assert seen[0].url.path.endswith(f"/{path}")
    assert data == {"nickname": "Phaethon"}


@pytest.mark.parametrize(("method_name", "path"), ROLE_ID_ENDPOINTS)
def test_the_endpoints_that_speak_role_id_ask_by_role_id_and_server(
    method_name: str, path: str
) -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}))

    fetch(client, method_name)

    params = seen[0].url.params
    assert params["role_id"] == UID
    assert params["server"] == REGION
    assert "uid" not in params
    assert "region" not in params


@pytest.mark.parametrize(("method_name", "path"), UID_ENDPOINTS)
def test_the_endpoints_that_speak_uid_ask_by_uid_and_region(method_name: str, path: str) -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}))

    fetch(client, method_name)

    params = seen[0].url.params
    assert params["uid"] == UID
    assert params["region"] == REGION
    assert "role_id" not in params
    assert "server" not in params


def test_the_stored_cookies_travel_in_the_cookie_header() -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}))

    fetch(client, "fetch_profile")

    assert seen[0].headers["Cookie"] == "ltuid_v2=42; ltoken_v2=v2_secret"


def test_the_request_identifies_the_tracker_and_asks_for_the_default_language() -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}))

    fetch(client, "fetch_profile")

    assert seen[0].headers["User-Agent"] == USER_AGENT
    assert "zzz-tracker" in USER_AGENT
    assert seen[0].headers["x-rpc-lang"] == "en-us"
    assert seen[0].headers["x-rpc-language"] == "en-us"


def test_a_client_configured_in_another_language_asks_hoyolab_for_it() -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}), language="es-es")

    fetch(client, "fetch_profile")

    assert seen[0].headers["x-rpc-lang"] == "es-es"
    assert seen[0].headers["x-rpc-language"] == "es-es"


@pytest.mark.parametrize("method_name", SCHEDULED_ENDPOINTS)
def test_the_seasonal_endpoints_ask_for_the_current_season_by_default(method_name: str) -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}))

    fetch(client, method_name)

    assert seen[0].url.params["schedule_type"] == "1"


@pytest.mark.parametrize("method_name", SCHEDULED_ENDPOINTS)
def test_the_seasonal_endpoints_can_be_asked_for_the_previous_season(method_name: str) -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}))

    fetch(client, method_name, schedule_type=SCHEDULE_PREVIOUS)

    assert seen[0].url.params["schedule_type"] == "2"


def test_an_endpoint_without_seasons_does_not_ask_for_a_schedule() -> None:
    client, seen = client_returning(chronicle_response(retcode=0, data={}))

    fetch(client, "fetch_profile")

    assert "schedule_type" not in seen[0].url.params


@pytest.mark.parametrize("retcode", [-100, 10001])
def test_cookies_hoyolab_rejects_are_reported_as_invalid_credentials(retcode: int) -> None:
    client, _ = client_returning(chronicle_response(retcode=retcode, message="Not logged in"))

    with pytest.raises(InvalidCredentialsError):
        fetch(client, "fetch_profile")


@pytest.mark.parametrize("retcode", [10102, 10104])
def test_a_chronicle_that_is_not_shared_is_reported_as_not_public(retcode: int) -> None:
    client, _ = client_returning(chronicle_response(retcode=retcode, message="Data is not public"))

    with pytest.raises(DataNotPublicError) as exc_info:
        fetch(client, "fetch_profile")

    assert UID in str(exc_info.value)


@pytest.mark.parametrize("retcode", [10101, -110, 1028])
def test_being_throttled_by_hoyolab_is_reported_as_rate_limited(retcode: int) -> None:
    client, _ = client_returning(chronicle_response(retcode=retcode, message="Too many requests"))

    with pytest.raises(RateLimitedError):
        fetch(client, "fetch_profile")


@pytest.mark.parametrize("retcode", [1034, 10035, 5003, 10041])
def test_risk_control_asking_for_a_captcha_is_reported_as_such(retcode: int) -> None:
    client, _ = client_returning(chronicle_response(retcode=retcode, message="Please verify"))

    with pytest.raises(CaptchaRequiredError):
        fetch(client, "fetch_profile")


@pytest.mark.parametrize(("retcode", "error"), MAPPED_FAILURES)
def test_what_hoyolab_says_about_a_mapped_failure_reaches_the_detail(
    retcode: int, error: type[ZZZTrackerError]
) -> None:
    client, _ = client_returning(chronicle_response(retcode=retcode, message=HOYOLAB_MESSAGE))

    with pytest.raises(error) as exc_info:
        fetch(client, "fetch_profile")

    assert f"({HOYOLAB_MESSAGE})" in str(exc_info.value)


@pytest.mark.parametrize(("retcode", "error"), MAPPED_FAILURES)
@pytest.mark.parametrize("message", [None, "", "   "])
def test_a_mapped_failure_hoyolab_says_nothing_about_reads_without_an_empty_aside(
    retcode: int, error: type[ZZZTrackerError], message: str | None
) -> None:
    payload: dict[str, Any] = {"retcode": retcode}
    if message is not None:
        payload["message"] = message
    client, _ = client_returning(httpx.Response(200, json=payload))

    with pytest.raises(error) as exc_info:
        fetch(client, "fetch_profile")

    detail = str(exc_info.value)
    assert "(" not in detail
    assert ")" not in detail
    assert detail == detail.strip()


def test_an_unknown_retcode_is_reported_as_an_upstream_failure_carrying_the_hoyolab_message() -> (
    None
):
    client, _ = client_returning(chronicle_response(retcode=-1, message="Internal data error"))

    with pytest.raises(ExternalServiceError) as exc_info:
        fetch(client, "fetch_profile")

    assert "-1" in str(exc_info.value)
    assert "Internal data error" in str(exc_info.value)


def test_a_retcode_that_hoyolab_omits_is_reported_as_an_upstream_failure() -> None:
    client, _ = client_returning(chronicle_response(data={"nickname": "Phaethon"}))

    with pytest.raises(ExternalServiceError):
        fetch(client, "fetch_profile")


def test_an_unreachable_hoyolab_is_reported_as_an_upstream_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = HoyolabClient(
        base_url=BASE_URL, client=httpx.Client(transport=httpx.MockTransport(handler))
    )

    with pytest.raises(ExternalServiceError):
        fetch(client, "fetch_profile")


def test_a_response_that_is_not_json_is_reported_as_an_upstream_failure() -> None:
    client, _ = client_returning(httpx.Response(200, text="<html>gateway error</html>"))

    with pytest.raises(ExternalServiceError):
        fetch(client, "fetch_profile")


def test_a_json_response_that_is_not_an_object_is_reported_as_an_upstream_failure() -> None:
    client, _ = client_returning(httpx.Response(200, json=[{"retcode": 0}]))

    with pytest.raises(ExternalServiceError):
        fetch(client, "fetch_profile")


@pytest.mark.parametrize("status_code", [403, 500, 503])
def test_any_http_status_other_than_200_is_reported_as_an_upstream_failure(
    status_code: int,
) -> None:
    client, _ = client_returning(httpx.Response(status_code, json={"retcode": 0, "data": {}}))

    with pytest.raises(ExternalServiceError) as exc_info:
        fetch(client, "fetch_profile")

    assert str(status_code) in str(exc_info.value)


def test_being_throttled_before_hoyolab_answers_is_reported_as_rate_limited() -> None:
    client, _ = client_returning(httpx.Response(429, text="too many requests"))

    with pytest.raises(RateLimitedError) as exc_info:
        fetch(client, "fetch_profile")

    assert "429" in str(exc_info.value)
    assert exc_info.value.status_code == 429


@pytest.mark.parametrize("payload", [{"retcode": 0}, {"retcode": 0, "data": None}])
def test_a_successful_answer_without_usable_data_is_read_as_an_empty_record(
    payload: dict[str, Any],
) -> None:
    client, _ = client_returning(httpx.Response(200, json=payload))

    assert fetch(client, "fetch_profile") == {}


def test_every_hoyolab_failure_is_a_tracker_error_the_api_knows_how_to_answer() -> None:
    client, _ = client_returning(chronicle_response(retcode=10102, message="Data is not public"))

    with pytest.raises(ZZZTrackerError) as exc_info:
        fetch(client, "fetch_profile")

    assert exc_info.value.status_code == 403
