import type { AgentDetailRead } from '../../api/types';
import type { AgentDraft, DiscDraft, WEngineDraft } from './types';
import { DISC_SLOTS } from './types';

export function emptyAgentDraft(): AgentDraft {
  return {
    game_id: '',
    level: '1',
    promotion_level: '0',
    mindscape_level: '0',
    core_skill_enhancement: '0',
    skill_levels: {},
    wengine: null,
    discs: DISC_SLOTS.map(emptyDiscDraft),
  };
}

export function emptyDiscDraft(slot: number): DiscDraft {
  return {
    slot,
    equipped: false,
    set_id: '',
    rarity: '4',
    level: '0',
    roll_count: '0',
    main_stat_id: '',
    main_stat_value: '0',
    substats: [],
    known_game_id: '',
  };
}

export function emptyWEngineDraft(): WEngineDraft {
  return { game_id: '', level: '1', modification_level: '0', phase: '1' };
}

export function draftFromAgent(agent: AgentDetailRead): AgentDraft {
  const bySlot = new Map(agent.discs.map((disc) => [disc.slot, disc]));

  return {
    game_id: String(agent.game_id),
    level: String(agent.level),
    promotion_level: String(agent.promotion_level),
    mindscape_level: String(agent.mindscape_level),
    core_skill_enhancement: String(agent.core_skill_enhancement),
    skill_levels: Object.fromEntries(
      Object.entries(agent.skill_levels).map(([key, value]) => [key, String(value)]),
    ),
    wengine: agent.wengine
      ? {
          game_id: String(agent.wengine.game_id),
          level: String(agent.wengine.level),
          modification_level: String(agent.wengine.modification_level),
          phase: String(agent.wengine.phase),
        }
      : null,
    discs: DISC_SLOTS.map((slot) => {
      const disc = bySlot.get(slot);
      if (!disc) return emptyDiscDraft(slot);
      return {
        slot,
        equipped: true,
        set_id: disc.set_id === null ? '' : String(disc.set_id),
        rarity: disc.rarity === null ? '4' : String(disc.rarity),
        level: String(disc.level),
        roll_count: String(disc.roll_count),
        main_stat_id: disc.main_stat === null ? '' : String(disc.main_stat.prop_id),
        main_stat_value: String(disc.main_stat?.value ?? 0),
        substats: disc.substats.map((stat) => ({
          prop_id: String(stat.prop_id),
          value: String(stat.value),
          rolls: String(stat.rolls),
        })),
        known_game_id: String(disc.game_id),
      };
    }),
  };
}
