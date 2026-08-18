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
  /** Base cruda de Enka: por roll en un substat, sin escalar por nivel en un stat principal. */
  value: number;
  rolls: number;
  /** Lo que muestra el juego. `null` si es un stat principal de un disco sin rareza conocida. */
  total: number | null;
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

export interface TeamMemberRead {
  slot: number;
  agent: AgentRead;
}

export interface TeamRead {
  id: number;
  account_uid: string;
  name: string;
  notes: string;
  members: TeamMemberRead[];
  created_at: string | null;
  updated_at: string | null;
}

export interface TeamListResponse {
  items: TeamRead[];
}

export interface TeamMemberWrite {
  slot: number;
  agent_id: number;
}

/** El equipo entero: mandarlo reemplaza nombre, notas y todos los miembros. */
export interface TeamWrite {
  name: string;
  notes: string;
  members: TeamMemberWrite[];
}

export interface SubstatWrite {
  prop_id: number;
  value: number;
  rolls: number;
}

export interface WEngineWrite {
  game_id: number;
  level: number;
  modification_level: number;
  phase: number;
}

export interface DriveDiscWrite {
  slot: number;
  /** Id de la pieza, no del set; el backend deduce `set_id` y `rarity` si van en null. */
  game_id: number;
  set_id: number | null;
  rarity: number | null;
  level: number;
  roll_count: number;
  main_stat_id: number | null;
  main_stat_value: number;
  substats: SubstatWrite[];
}

export interface AgentWrite {
  game_id: number;
  level: number;
  promotion_level: number;
  mindscape_level: number;
  core_skill_enhancement: number;
  skill_levels: Record<string, number>;
  wengine: WEngineWrite | null;
  discs: DriveDiscWrite[];
}

/**
 * Corrección de un agente: solo viaja lo que cambió.
 *
 * `wengine` y `discs` reemplazan, no mergean. Omitir una clave la deja intacta; mandar
 * `wengine: null` desequipa y `discs: []` vacía los discos.
 */
export interface AgentUpdate {
  level?: number;
  promotion_level?: number;
  mindscape_level?: number;
  core_skill_enhancement?: number;
  skill_levels?: Record<string, number>;
  wengine?: WEngineWrite | null;
  discs?: DriveDiscWrite[];
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
