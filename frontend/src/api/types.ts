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
  last_synced_at: string | null;
  next_sync_available_at: string | null;
  region: string;
  chronicle_public: boolean;
  chronicle_synced_at: string | null;
  chronicle_import_source: ChronicleImportSource | null;
  has_hoyolab_credentials: boolean;
  claim_level: ClaimLevel;
  agent_count: number;
}

export type ClaimLevel = 'unclaimed' | 'provisional' | 'verified';

export const CLAIM_UNCLAIMED: ClaimLevel = 'unclaimed';

export interface AccountCreatedRead extends AccountRead {
  account_key: string | null;
}

export type ClaimResponse = AccountCreatedRead;

export type ChronicleImportSource = 'extension' | 'server';

export interface StatRead {
  prop_id: number;
  name: string | null;
  format: string | null;
  value: number;
  rolls: number;
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
  bonus_props: Record<string, number>;
}

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

export type ChallengeMode = 'shiyu_defense' | 'deadly_assault';

export const MODE_SHIYU_DEFENSE: ChallengeMode = 'shiyu_defense';
export const MODE_DEADLY_ASSAULT: ChallengeMode = 'deadly_assault';
export const CHALLENGE_MODES: ChallengeMode[] = [MODE_SHIYU_DEFENSE, MODE_DEADLY_ASSAULT];

export interface CredentialWrite {
  ltuid_v2: string;
  ltoken_v2: string;
}

export interface CredentialStatusRead {
  account_uid: string;
  stored: boolean;
  rejected: boolean;
  last_used_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CredentialRead {
  account_uid: string;
  ltuid_v2: string;
  rejected: boolean;
  last_used_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChallengeAgentRead {
  game_id: number;
  level: number;
  rarity: string;
  element: string;
  mindscape: number;
  icon: string;
}

export interface ChallengeEntryRead {
  position: number;
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
  skipped: boolean;
  agents_synced: number;
  bangboos_synced: number;
  lost_void_synced: boolean;
  unavailable_modes: string[];
  runs: ChallengeRunRead[];
}
