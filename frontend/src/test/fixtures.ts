import type {
  AccountRead,
  AgentDetailRead,
  AgentRead,
  BangbooRead,
  ChallengeEntryRead,
  ChallengeRunRead,
  DriveDiscRead,
  LostVoidRead,
  StatRead,
  TeamRead,
  WEngineRead,
} from '../api/types';
import { MODE_SHIYU_DEFENSE } from '../api/types';
import { discGameId } from '../lib/agentDraft';
import { UID } from './render';

export function account(overrides: Partial<AccountRead> = {}): AccountRead {
  return {
    uid: UID,
    nickname: 'Proxy',
    level: 51,
    signature: 'Sexta Calle, turno noche',
    profile_id: null,
    avatar_id: null,
    title_id: null,
    calling_card_id: null,
    last_synced_at: '2026-09-01T12:00:00Z',
    next_sync_available_at: null,
    region: 'prod_gf_us',
    chronicle_public: true,
    chronicle_synced_at: '2026-09-01T12:00:00Z',
    chronicle_import_source: 'extension',
    has_owner: true,
    agent_count: 3,
    ...overrides,
  };
}

export function wengine(overrides: Partial<WEngineRead> = {}): WEngineRead {
  return {
    game_id: 14109,
    name: 'Deep Sea Visitor',
    icon_url: null,
    rarity: 4,
    level: 60,
    modification_level: 5,
    phase: 1,
    ...overrides,
  };
}

export function agent(overrides: Partial<AgentRead> = {}): AgentRead {
  return {
    id: 1,
    account_uid: UID,
    game_id: 1091,
    name: 'Ellen Joe',
    icon_url: null,
    rarity: 4,
    profession: 'Attack',
    elements: ['Ice'],
    level: 60,
    promotion_level: 5,
    mindscape_level: 2,
    core_skill_enhancement: 6,
    source: 'enka',
    wengine: wengine(),
    disc_count: 6,
    ...overrides,
  };
}

/** Ellen a full six discs, Lycaon a half build, Anby fresh out of the box. */
export function roster(): AgentRead[] {
  return [
    agent({
      id: 3,
      game_id: 1011,
      name: 'Anby',
      elements: ['Elec'],
      profession: 'Stun',
      rarity: 3,
      level: 20,
      mindscape_level: 0,
      disc_count: 0,
      wengine: null,
    }),
    agent({
      id: 2,
      game_id: 1061,
      name: 'Von Lycaon',
      elements: ['Ice'],
      profession: 'Stun',
      level: 50,
      mindscape_level: 0,
      disc_count: 3,
      wengine: wengine({ game_id: 14104, name: 'The Restrained' }),
    }),
    agent({ id: 1, game_id: 1091, name: 'Ellen Joe' }),
  ];
}

export function stat(overrides: Partial<StatRead> = {}): StatRead {
  return {
    prop_id: 20103,
    name: 'Crit',
    format: '%',
    value: 240,
    rolls: 2,
    total: null,
    ...overrides,
  };
}

export function disc(slot: number, overrides: Partial<DriveDiscRead> = {}): DriveDiscRead {
  return {
    slot,
    game_id: discGameId(31000, 4, slot),
    set_id: 31000,
    set_name: 'Polar Metal',
    set_icon_url: null,
    rarity: 4,
    level: 15,
    roll_count: 5,
    main_stat: stat({ prop_id: 12102, name: 'atk_ratio', value: 3000, rolls: 0 }),
    substats: [
      stat({ prop_id: 20103, name: 'Crit', value: 240, rolls: 2 }),
      stat({ prop_id: 21103, name: 'critdmg', value: 384, rolls: 1 }),
    ],
    ...overrides,
  };
}

export function agentDetail(overrides: Partial<AgentDetailRead> = {}): AgentDetailRead {
  return {
    ...agent(),
    image_url: null,
    skill_levels: { '0': 9, '1': 9, '2': 7, '3': 9, '5': 9, '6': 7 },
    weapon_effect_state: null,
    obtained_at: '2025-07-04T10:00:00Z',
    discs: [1, 2, 3, 4, 5, 6].map((slot) => disc(slot)),
    equipped_sets: [
      {
        set_id: 31000,
        name: 'Polar Metal',
        icon_url: null,
        pieces: 4,
        bonus_props: { '31201': 1000 },
      },
    ],
    ...overrides,
  };
}

export function team(overrides: Partial<TeamRead> = {}): TeamRead {
  const members = roster().slice(0, 3);
  return {
    id: 7,
    account_uid: UID,
    name: 'Congelador',
    notes: 'Shiyu capa 7',
    members: members.map((each, index) => ({ slot: index + 1, agent: each })),
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

export function attempt(overrides: Partial<ChallengeEntryRead> = {}): ChallengeEntryRead {
  return {
    position: 1,
    layer_index: 7,
    layer_id: 70,
    name: 'Capa 7',
    rating: 'S',
    score: 1000,
    max_score: 1000,
    stars: 3,
    clear_time_seconds: 132,
    challenged_at: '2026-08-28T20:00:00Z',
    boss_name: 'Marionette Guardian',
    boss_icon: '',
    buffs: [],
    agents: [{ game_id: 1091, level: 60, rarity: 'S', element: 'Ice', mindscape: 2, icon: '' }],
    bangboo_id: 53001,
    ...overrides,
  };
}

export function run(overrides: Partial<ChallengeRunRead> = {}): ChallengeRunRead {
  return {
    id: 11,
    account_uid: UID,
    mode: MODE_SHIYU_DEFENSE,
    schedule_id: 42,
    begin_time: '2026-08-15T04:00:00Z',
    end_time: '2026-09-01T03:59:00Z',
    rating: 'S+',
    score: 1000,
    max_score: 1000,
    total_stars: 27,
    rank_percent: 12.5,
    clear_time_seconds: 900,
    schema_version: '1',
    synced_at: '2026-09-01T12:00:00Z',
    entries: [attempt()],
    ...overrides,
  };
}

export function bangboo(overrides: Partial<BangbooRead> = {}): BangbooRead {
  return {
    game_id: 53001,
    name: 'Amillion',
    level: 60,
    rarity: 4,
    star: 5,
    icon: '',
    ...overrides,
  };
}

export function lostVoid(overrides: Partial<LostVoidRead> = {}): LostVoidRead {
  return {
    account_uid: UID,
    license_level: 12,
    exploration_log: 84,
    max_exploration_log: 120,
    commissions_done: 30,
    commissions_total: 45,
    ultimate_challenge_score: 4200,
    ultimate_challenge_tier: 'Nivel VI',
    data_collected: 9500,
    synced_at: '2026-09-01T12:00:00Z',
    ...overrides,
  };
}
