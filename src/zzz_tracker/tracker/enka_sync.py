from __future__ import annotations

from sqlalchemy.orm import Session

from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.mapper import ParsedProfile, parse_profile
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.storage.models import Account, utc_now
from zzz_tracker.tracker.accounts import AccountService
from zzz_tracker.tracker.agents import AgentService
from zzz_tracker.tracker.rows import copy_fields

DEFAULT_SYNC_TTL_SECONDS = 60

ACCOUNT_FIELDS = (
    "nickname",
    "level",
    "signature",
    "profile_id",
    "avatar_id",
    "title_id",
    "calling_card_id",
)


class EnkaSyncService:
    """Importing an account from Enka's public showcase."""

    def __init__(
        self,
        session: Session,
        accounts: AccountService,
        agents: AgentService,
        enka: EnkaClient,
        static: StaticData | None = None,
    ) -> None:
        self._session = session
        self._accounts = accounts
        self._agents = agents
        self._enka = enka
        self._static = static

    def sync_account(self, uid: str, force: bool = False) -> Account:
        """Import (or refresh) an account from Enka, honouring the ttl it reports."""
        existing = self._accounts.find_account(uid)
        if existing is not None and not force and not existing.is_sync_due():
            return existing

        profile = parse_profile(self._enka.fetch_profile(uid), self._static)
        account = self._upsert_account(uid, profile)
        for parsed_agent in profile.agents:
            self._agents.upsert_enka_build(account, parsed_agent)

        self._session.commit()
        self._session.refresh(account)
        return account

    def _upsert_account(self, uid: str, profile: ParsedProfile) -> Account:
        account = self._accounts.find_account(uid)
        if account is None:
            account = Account(uid=uid)
            self._session.add(account)

        copy_fields(account, profile.account, ACCOUNT_FIELDS)
        account.last_synced_at = utc_now()
        account.sync_ttl_seconds = profile.ttl or DEFAULT_SYNC_TTL_SECONDS
        self._session.flush()
        return account
