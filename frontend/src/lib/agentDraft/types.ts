export const LIMITS = {
  level: [1, 60],
  promotion_level: [0, 5],
  mindscape_level: [0, 6],
  core_skill_enhancement: [0, 6],
  wengineLevel: [1, 60],
  modification_level: [0, 5],
  phase: [1, 5],
  discLevel: [0, 15],
  discProcs: [0, 5],
  substatRolls: [1, 6],
  skillLevel: [0, 12],
} as const;

export const DISC_SLOTS = [1, 2, 3, 4, 5, 6];
export const DISC_RARITIES = [2, 3, 4];
export const MAX_SUBSTATS = 4;

export interface SubstatDraft {
  prop_id: string;
  value: string;
  rolls: string;
}

export interface DiscDraft {
  slot: number;
  equipped: boolean;
  set_id: string;
  rarity: string;
  level: string;
  roll_count: string;
  main_stat_id: string;
  main_stat_value: string;
  substats: SubstatDraft[];
  known_game_id: string;
}

export interface WEngineDraft {
  game_id: string;
  level: string;
  modification_level: string;
  phase: string;
}

export interface AgentDraft {
  game_id: string;
  level: string;
  promotion_level: string;
  mindscape_level: string;
  core_skill_enhancement: string;
  skill_levels: Record<string, string>;
  wengine: WEngineDraft | null;
  discs: DiscDraft[];
}
