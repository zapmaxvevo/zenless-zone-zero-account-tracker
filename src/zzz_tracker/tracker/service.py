from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from zzz_tracker.enka.client import EnkaClient
from zzz_tracker.enka.mapper import ParsedAgent, ParsedProfile, parse_profile
from zzz_tracker.enka.static_data import StaticData
from zzz_tracker.errors import NotFoundError
from zzz_tracker.storage.models import (
    SOURCE_ENKA,
    Account,
    Agent,
    DriveDisc,
    WEngine,
    utc_now,
)


class TrackerService:
    """Use cases around tracked accounts: importing from Enka and reading them back.

    Sync never overwrites hand-edited data: agents whose `source` is `manual` are left
    untouched, and agents missing from the showcase are kept rather than deleted, since
    Enka only exposes the handful of agents the player put on display.
    """

    def __init__(
        self,
        session: Session,
        enka: EnkaClient,
        static: StaticData | None = None,
    ) -> None:
        self._session = session
        self._enka = enka
        self._static = static

    def list_accounts(self) -> list[Account]:
        return list(self._session.scalars(select(Account).order_by(Account.uid)))

    def find_account(self, uid: str) -> Account | None:
        return self._session.get(Account, uid)

    def get_account(self, uid: str) -> Account:
        account = self.find_account(uid)
        if account is None:
            raise NotFoundError(f"Account {uid} is not tracked yet")
        return account

    def sync_account(self, uid: str, force: bool = False) -> Account:
        """Import (or refresh) an account from Enka, honouring the ttl it reports."""
        existing = self.find_account(uid)
        if existing is not None and not force and not existing.is_sync_due():
            return existing

        profile = parse_profile(self._enka.fetch_profile(uid), self._static)
        account = self._upsert_account(uid, profile)
        for parsed_agent in profile.agents:
            self._upsert_agent(account, parsed_agent)

        self._session.commit()
        self._session.refresh(account)
        return account

    def _upsert_account(self, uid: str, profile: ParsedProfile) -> Account:
        parsed = profile.account
        account = self.find_account(uid)
        if account is None:
            account = Account(uid=uid)
            self._session.add(account)

        account.nickname = parsed.nickname
        account.level = parsed.level
        account.signature = parsed.signature
        account.profile_id = parsed.profile_id
        account.avatar_id = parsed.avatar_id
        account.title_id = parsed.title_id
        account.calling_card_id = parsed.calling_card_id
        account.last_synced_at = utc_now().replace(tzinfo=None)
        account.sync_ttl_seconds = profile.ttl
        self._session.flush()
        return account

    def _upsert_agent(self, account: Account, parsed: ParsedAgent) -> Agent | None:
        agent = self._session.scalars(
            select(Agent).where(
                Agent.account_uid == account.uid,
                Agent.game_id == parsed.game_id,
            )
        ).one_or_none()

        if agent is not None and agent.is_manual:
            return None

        if agent is None:
            agent = Agent(account_uid=account.uid, game_id=parsed.game_id)
            self._session.add(agent)

        agent.level = parsed.level
        agent.promotion_level = parsed.promotion_level
        agent.mindscape_level = parsed.mindscape_level
        agent.core_skill_enhancement = parsed.core_skill_enhancement
        agent.skill_levels = dict(parsed.skill_levels)
        agent.weapon_effect_state = parsed.weapon_effect_state
        agent.obtained_at = _naive(parsed.obtained_at)
        agent.source = SOURCE_ENKA
        self._session.flush()

        self._replace_wengine(agent, parsed)
        self._replace_discs(agent, parsed)
        return agent

    def _replace_wengine(self, agent: Agent, parsed: ParsedAgent) -> None:
        if parsed.wengine is None:
            agent.wengine = None
            return
        wengine = agent.wengine or WEngine(agent_id=agent.id)
        wengine.game_id = parsed.wengine.game_id
        wengine.level = parsed.wengine.level
        wengine.modification_level = parsed.wengine.modification_level
        wengine.phase = parsed.wengine.phase
        wengine.item_uid = parsed.wengine.item_uid
        agent.wengine = wengine

    def _replace_discs(self, agent: Agent, parsed: ParsedAgent) -> None:
        by_slot = {disc.slot: disc for disc in agent.discs}
        for parsed_disc in parsed.discs:
            disc = by_slot.pop(parsed_disc.slot, None) or DriveDisc(
                agent_id=agent.id, slot=parsed_disc.slot
            )
            disc.game_id = parsed_disc.game_id
            disc.suit_id = parsed_disc.suit_id
            disc.rarity = parsed_disc.rarity
            disc.level = parsed_disc.level
            disc.roll_count = parsed_disc.roll_count
            disc.main_stat = parsed_disc.main_stat.as_main_stat() if parsed_disc.main_stat else {}
            disc.substats = [stat.as_substat() for stat in parsed_disc.substats]
            disc.item_uid = parsed_disc.item_uid
            if disc not in agent.discs:
                agent.discs.append(disc)
        for stale in by_slot.values():
            agent.discs.remove(stale)


def _naive(value: datetime | None) -> datetime | None:
    """SQLite columns are timezone-naive; store UTC without the tzinfo."""
    if value is None:
        return None
    return value.replace(tzinfo=None)
