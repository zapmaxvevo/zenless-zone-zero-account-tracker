from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from zzz_tracker.enka.mapper import ParsedAgent, ParsedDisc, ParsedWEngine
from zzz_tracker.errors import ConflictError, NotFoundError, ValidationError
from zzz_tracker.storage.models import (
    SOURCE_ENKA,
    SOURCE_HOYOLAB,
    SOURCE_MANUAL,
    Account,
    Agent,
    DriveDisc,
    TeamMember,
    WEngine,
)
from zzz_tracker.tracker.accounts import AccountService
from zzz_tracker.tracker.rows import copy_fields

DISC_SLOTS = 6

# The columns copied straight from a parsed build; `skill_levels` is copied, not shared.
BUILD_FIELDS = (
    "level",
    "promotion_level",
    "mindscape_level",
    "core_skill_enhancement",
    "weapon_effect_state",
    "obtained_at",
)
WENGINE_FIELDS = ("game_id", "level", "modification_level", "phase", "item_uid")
EDITABLE_FIELDS = ("level", "promotion_level", "mindscape_level", "core_skill_enhancement")


@dataclass(frozen=True, slots=True)
class AgentEdit:
    """A partial change to a tracked agent; `None` means "leave it as it is"."""

    level: int | None = None
    promotion_level: int | None = None
    mindscape_level: int | None = None
    core_skill_enhancement: int | None = None
    skill_levels: dict[str, int] | None = None
    wengine: ParsedWEngine | None = None
    clear_wengine: bool = False
    discs: tuple[ParsedDisc, ...] | None = None


class AgentService:
    """Tracked agents and the builds written onto them, by hand or by a sync."""

    def __init__(self, session: Session, accounts: AccountService) -> None:
        self._session = session
        self._accounts = accounts

    def list_agents(self, uid: str) -> list[Agent]:
        self._accounts.get_account(uid)
        return list(
            self._session.scalars(
                select(Agent).where(Agent.account_uid == uid).order_by(Agent.game_id)
            )
        )

    def get_agent(self, agent_id: int) -> Agent:
        agent = self._session.get(Agent, agent_id)
        if agent is None:
            raise NotFoundError(f"Agent {agent_id} is not tracked")
        return agent

    def create_agent(self, uid: str, parsed: ParsedAgent) -> Agent:
        """Add an agent Enka never showed, with the build the player typed in."""
        account = self._accounts.get_account(uid)
        if self.find_agent(uid, parsed.game_id) is not None:
            raise ConflictError(f"Agent {parsed.game_id} is already tracked for account {uid}")
        self._ensure_one_disc_per_slot(parsed.discs)

        agent = self.write_build(account, parsed, SOURCE_MANUAL)
        # `write_build` only declines a build for an agent already marked manual, and the
        # conflict check above proves there is no agent here at all.
        assert agent is not None

        self._session.commit()
        self._session.refresh(agent)
        return agent

    def update_agent(self, agent_id: int, edit: AgentEdit) -> Agent:
        """Correct an agent by hand. Doing so makes it `manual`, so no sync overwrites it."""
        agent = self.get_agent(agent_id)
        if edit.discs is not None:
            self._ensure_one_disc_per_slot(edit.discs)

        for name in EDITABLE_FIELDS:
            value = getattr(edit, name)
            if value is not None:
                setattr(agent, name, value)
        if edit.skill_levels is not None:
            agent.skill_levels = dict(edit.skill_levels)
        agent.source = SOURCE_MANUAL
        self._session.flush()

        if edit.wengine is not None or edit.clear_wengine:
            self._replace_wengine(agent, edit.wengine)
        if edit.discs is not None:
            self._replace_discs(agent, edit.discs)

        self._session.commit()
        self._session.refresh(agent)
        return agent

    def delete_agent(self, agent_id: int) -> None:
        """Stop tracking an agent, freeing the slot it held in any team comp."""
        agent = self.get_agent(agent_id)
        self._session.execute(delete(TeamMember).where(TeamMember.agent_id == agent.id))
        self._session.delete(agent)
        self._session.commit()

    def find_agent(self, uid: str, game_id: int) -> Agent | None:
        return self._session.scalars(
            select(Agent).where(Agent.account_uid == uid, Agent.game_id == game_id)
        ).one_or_none()

    def upsert_enka_build(self, account: Account, parsed: ParsedAgent) -> Agent | None:
        return self.write_build(account, parsed, SOURCE_ENKA)

    def upsert_hoyolab_build(self, account: Account, parsed: ParsedAgent) -> Agent | None:
        return self.write_build(account, parsed, SOURCE_HOYOLAB)

    def write_build(self, account: Account, parsed: ParsedAgent, source: str) -> Agent | None:
        """Write a whole build, whoever read it, unless the agent was edited by hand."""
        agent = self.find_agent(account.uid, parsed.game_id)

        if agent is not None and agent.is_manual:
            return None

        if agent is None:
            agent = Agent(account_uid=account.uid, game_id=parsed.game_id)
            self._session.add(agent)

        copy_fields(agent, parsed, BUILD_FIELDS)
        agent.skill_levels = dict(parsed.skill_levels)
        agent.source = source
        self._session.flush()

        self._replace_wengine(agent, parsed.wengine)
        self._replace_discs(agent, parsed.discs)
        return agent

    def _ensure_one_disc_per_slot(self, discs: Sequence[ParsedDisc]) -> None:
        slots = [disc.slot for disc in discs]
        if len(set(slots)) != len(slots):
            raise ValidationError("Each drive disc slot can only be filled once")

    def _replace_wengine(self, agent: Agent, parsed: ParsedWEngine | None) -> None:
        if parsed is None:
            agent.wengine = None
            return
        wengine = agent.wengine or WEngine(agent_id=agent.id)
        copy_fields(wengine, parsed, WENGINE_FIELDS)
        agent.wengine = wengine

    def _replace_discs(self, agent: Agent, discs: Sequence[ParsedDisc]) -> None:
        by_slot = {disc.slot: disc for disc in agent.discs}
        for parsed_disc in discs:
            disc = by_slot.pop(parsed_disc.slot, None) or DriveDisc(
                agent_id=agent.id, slot=parsed_disc.slot
            )
            disc.game_id = parsed_disc.game_id
            disc.set_id = parsed_disc.set_id
            disc.rarity = parsed_disc.rarity
            disc.level = parsed_disc.level
            disc.roll_count = parsed_disc.roll_count
            disc.main_stat_id = parsed_disc.main_stat.prop_id if parsed_disc.main_stat else None
            disc.main_stat_value = parsed_disc.main_stat.value if parsed_disc.main_stat else 0
            disc.substats = [stat.as_substat() for stat in parsed_disc.substats]
            disc.item_uid = parsed_disc.item_uid
            if disc not in agent.discs:
                agent.discs.append(disc)
        for stale in by_slot.values():
            agent.discs.remove(stale)
