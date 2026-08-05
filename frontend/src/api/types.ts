/** Espejo de `src/zzz_tracker/web/schemas.py`: mismos nombres, mismo snake_case. */

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
}

export interface AccountRead {
  uid: string;
  nickname: string;
  level: number;
  signature: string;
  profile_id: number | null;
  avatar_id: number | null;
  title_id: number | null;
  calling_card_id: number | null;
  /** ISO 8601 en UTC. */
  last_synced_at: string | null;
  /** ISO 8601 en UTC; hasta ese momento el sync no vuelve a pegarle a Enka. */
  next_sync_available_at: string | null;
  agent_count: number;
}

export interface StatRead {
  prop_id: number;
  name: string | null;
  /** Formato .NET de Enka (`{0:0}`, `{0:0.#}`, `{0:0.#%}`); ver `lib/stats.ts`. */
  format: string | null;
  value: number;
  rolls: number;
}

export interface WEngineRead {
  game_id: number;
  name: string | null;
  icon_url: string | null;
  rarity: number | null;
  level: number;
  modification_level: number;
  phase: number;
}

export interface DriveDiscRead {
  slot: number;
  game_id: number;
  set_id: number | null;
  set_name: string | null;
  set_icon_url: string | null;
  rarity: number | null;
  level: number;
  roll_count: number;
  main_stat: StatRead | null;
  substats: StatRead[];
}

export interface EquippedSetRead {
  set_id: number;
  name: string | null;
  icon_url: string | null;
  pieces: number;
  /** Claves: prop id como string. */
  bonus_props: Record<string, number>;
}

export type AgentSource = 'enka' | 'manual';

export interface AgentRead {
  id: number;
  account_uid: string;
  game_id: number;
  name: string | null;
  icon_url: string | null;
  rarity: number | null;
  profession: string | null;
  elements: string[];
  level: number;
  promotion_level: number;
  mindscape_level: number;
  core_skill_enhancement: number;
  source: AgentSource;
  wengine: WEngineRead | null;
  disc_count: number;
}

export interface AgentDetailRead extends AgentRead {
  image_url: string | null;
  /** Claves: índice de habilidad como string. */
  skill_levels: Record<string, number>;
  weapon_effect_state: number | null;
  obtained_at: string | null;
  discs: DriveDiscRead[];
  equipped_sets: EquippedSetRead[];
}

export interface AccountListResponse {
  items: AccountRead[];
}

export interface AgentListResponse {
  items: AgentRead[];
}

export interface CatalogAgentRead {
  game_id: number;
  name: string;
  rarity: number | null;
  profession: string | null;
  elements: string[];
  image_url: string | null;
  icon_url: string | null;
}

export interface CatalogWEngineRead {
  game_id: number;
  name: string;
  rarity: number | null;
  profession: string | null;
  image_url: string | null;
}

export interface CatalogDiscSetRead {
  set_id: number;
  name: string;
  icon_url: string | null;
  bonus_props: Record<string, number>;
}

export interface CatalogPropertyRead {
  prop_id: number;
  name: string;
  format: string;
}

export interface CatalogListResponse<T> {
  items: T[];
}
