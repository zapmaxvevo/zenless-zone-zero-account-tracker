import type {
  AgentDetailRead,
  AgentUpdate,
  AgentWrite,
  DriveDiscWrite,
  SubstatWrite,
  WEngineWrite,
} from '../../api/types';
import { parseId, toNumber } from './parse';
import type { AgentDraft, DiscDraft, WEngineDraft } from './types';
import { LIMITS } from './types';

export function discGameId(setId: number, rarity: number, slot: number): number {
  return setId + rarity * 10 + slot;
}

export function toAgentWrite(draft: AgentDraft): AgentWrite {
  return {
    game_id: parseId(draft.game_id) ?? 0,
    ...buildBody(draft),
  };
}

export function toAgentUpdate(draft: AgentDraft, original: AgentDetailRead): AgentUpdate {
  const next = buildBody(draft);
  const before = bodyFromAgent(original);
  const update: AgentUpdate = {};

  if (next.level !== before.level) update.level = next.level;
  if (next.promotion_level !== before.promotion_level) {
    update.promotion_level = next.promotion_level;
  }
  if (next.mindscape_level !== before.mindscape_level) {
    update.mindscape_level = next.mindscape_level;
  }
  if (next.core_skill_enhancement !== before.core_skill_enhancement) {
    update.core_skill_enhancement = next.core_skill_enhancement;
  }
  if (!same(next.skill_levels, before.skill_levels)) update.skill_levels = next.skill_levels;
  if (!same(next.wengine, before.wengine)) update.wengine = next.wengine;
  if (!same(next.discs, before.discs)) update.discs = next.discs;

  return update;
}

type AgentBody = Omit<AgentWrite, 'game_id'>;

function buildBody(draft: AgentDraft): AgentBody {
  return {
    level: parseInt(draft.level, 10) || LIMITS.level[0],
    promotion_level: toNumber(draft.promotion_level),
    mindscape_level: toNumber(draft.mindscape_level),
    core_skill_enhancement: toNumber(draft.core_skill_enhancement),
    skill_levels: Object.fromEntries(
      Object.entries(draft.skill_levels)
        .filter(([, value]) => value.trim() !== '')
        .map(([key, value]) => [key, toNumber(value)]),
    ),
    wengine: toWEngineWrite(draft.wengine),
    discs: draft.discs.filter((disc) => disc.equipped).map(toDiscWrite),
  };
}

function bodyFromAgent(agent: AgentDetailRead): AgentBody {
  return {
    level: agent.level,
    promotion_level: agent.promotion_level,
    mindscape_level: agent.mindscape_level,
    core_skill_enhancement: agent.core_skill_enhancement,
    skill_levels: { ...agent.skill_levels },
    wengine: agent.wengine
      ? {
          game_id: agent.wengine.game_id,
          level: agent.wengine.level,
          modification_level: agent.wengine.modification_level,
          phase: agent.wengine.phase,
        }
      : null,
    discs: agent.discs.map((disc) => ({
      slot: disc.slot,
      game_id: disc.game_id,
      set_id: disc.set_id,
      rarity: disc.rarity,
      level: disc.level,
      roll_count: disc.roll_count,
      main_stat_id: disc.main_stat?.prop_id ?? null,
      main_stat_value: disc.main_stat?.value ?? 0,
      substats: disc.substats.map((stat) => ({
        prop_id: stat.prop_id,
        value: stat.value,
        rolls: stat.rolls,
      })),
    })),
  };
}

function toWEngineWrite(draft: WEngineDraft | null): WEngineWrite | null {
  const gameId = draft && parseId(draft.game_id);
  if (!draft || !gameId) return null;
  return {
    game_id: gameId,
    level: parseInt(draft.level, 10) || LIMITS.wengineLevel[0],
    modification_level: toNumber(draft.modification_level),
    phase: parseInt(draft.phase, 10) || LIMITS.phase[0],
  };
}

function toDiscWrite(draft: DiscDraft): DriveDiscWrite {
  const setId = parseId(draft.set_id);
  const rarity = parseId(draft.rarity);
  const gameId =
    setId && rarity ? discGameId(setId, rarity, draft.slot) : (parseId(draft.known_game_id) ?? 0);
  const mainStatId = parseId(draft.main_stat_id);

  return {
    slot: draft.slot,
    game_id: gameId,
    set_id: setId,
    rarity: rarity,
    level: toNumber(draft.level),
    roll_count: toNumber(draft.roll_count),
    main_stat_id: mainStatId,
    main_stat_value: mainStatId ? toNumber(draft.main_stat_value) : 0,
    substats: draft.substats.flatMap<SubstatWrite>((substat) => {
      const propId = parseId(substat.prop_id);
      if (!propId) return [];
      return [
        {
          prop_id: propId,
          value: toNumber(substat.value),
          rolls: toNumber(substat.rolls, LIMITS.substatRolls[0]),
        },
      ];
    }),
  };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
