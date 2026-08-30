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
  /** Servidor deducido del UID cuando la cuenta todavía no lo trae: `América`, `Asia`… */
  region: string;
  /** Si el Battle Chronicle de HoYoLAB está público; sin eso el sync de Chronicle no ve nada. */
  chronicle_public: boolean;
  /** ISO 8601 en UTC de la última sincronización con HoYoLAB, distinta de la de Enka. */
  chronicle_synced_at: string | null;
  /** De dónde salió el último Chronicle; `null` mientras nunca haya entrado uno. */
  chronicle_import_source: ChronicleImportSource | null;
  /** Hay cookies de HoYoLAB guardadas: el sync server-side puede correr. */
  has_hoyolab_credentials: boolean;
  agent_count: number;
}

/** La extensión sube el paquete desde el navegador; `server` es el sync con cookies. */
export type ChronicleImportSource = 'extension' | 'server';

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

/** `enka` es el showcase, `hoyolab` el Battle Chronicle y `manual` lo tipeado a mano. */
export type AgentSource = 'enka' | 'hoyolab' | 'manual';

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

/** Los dos modos que el backend guarda (`MODE_SHIYU_DEFENSE` / `MODE_DEADLY_ASSAULT`). */
export type ChallengeMode = 'shiyu_defense' | 'deadly_assault';

export const MODE_SHIYU_DEFENSE: ChallengeMode = 'shiyu_defense';
export const MODE_DEADLY_ASSAULT: ChallengeMode = 'deadly_assault';
export const CHALLENGE_MODES: ChallengeMode[] = [MODE_SHIYU_DEFENSE, MODE_DEADLY_ASSAULT];

/** Cookies de HoYoLAB; solo viajan al backend, que nunca devuelve el `ltoken_v2`. */
export interface CredentialWrite {
  ltuid_v2: string;
  ltoken_v2: string;
}

export interface CredentialRead {
  account_uid: string;
  ltuid_v2: string;
  /** HoYoLAB rechazó estas cookies: hay que volver a cargarlas. */
  rejected: boolean;
  last_used_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChallengeAgentRead {
  game_id: number;
  level: number;
  /** El Chronicle manda la rareza como letra (`'S'`, `'A'`), no como número. */
  rarity: string;
  element: string;
  mindscape: number;
  icon: string;
}

export interface ChallengeEntryRead {
  position: number;
  /** Capa de Shiyu; los modos que no tienen capas lo mandan en null. */
  layer_index: number | null;
  layer_id: number | null;
  name: string;
  rating: string;
  score: number;
  max_score: number;
  stars: number;
  clear_time_seconds: number | null;
  challenged_at: string | null;
  boss_name: string;
  boss_icon: string;
  /** Crudo del Chronicle: la forma de cada buff no está garantizada. */
  buffs: Record<string, unknown>[];
  agents: ChallengeAgentRead[];
  bangboo_id: number | null;
}

export interface ChallengeRunRead {
  id: number;
  account_uid: string;
  mode: ChallengeMode;
  schedule_id: number;
  begin_time: string | null;
  end_time: string | null;
  rating: string;
  score: number;
  max_score: number;
  total_stars: number;
  /** Ya viene en porcentaje (2,5 = 2,5%); el backend divide por 100 lo que manda HoYoLAB. */
  rank_percent: number | null;
  clear_time_seconds: number | null;
  schema_version: string;
  synced_at: string | null;
  entries: ChallengeEntryRead[];
}

export interface ChallengeRunListResponse {
  items: ChallengeRunRead[];
}

export interface BangbooRead {
  game_id: number;
  name: string;
  level: number;
  rarity: number | null;
  star: number;
  icon: string;
}

export interface BangbooListResponse {
  items: BangbooRead[];
}

export interface LostVoidRead {
  account_uid: string;
  license_level: number;
  exploration_log: number;
  max_exploration_log: number;
  commissions_done: number;
  commissions_total: number;
  ultimate_challenge_score: number;
  ultimate_challenge_tier: string;
  data_collected: number;
  synced_at: string | null;
}

export interface ChronicleSyncResponse {
  account_uid: string;
  /** El ttl del Chronicle no venció: no se pidió nada y `runs` trae lo ya guardado. */
  skipped: boolean;
  agents_synced: number;
  bangboos_synced: number;
  lost_void_synced: boolean;
  /** Modos que HoYoLAB no devolvió esta vez, con los valores de `ChallengeMode`. */
  unavailable_modes: string[];
  runs: ChallengeRunRead[];
}
