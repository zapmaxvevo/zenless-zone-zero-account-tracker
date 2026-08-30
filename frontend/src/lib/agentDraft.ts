import type {
  AgentDetailRead,
  AgentUpdate,
  AgentWrite,
  DriveDiscWrite,
  SubstatWrite,
  WEngineWrite,
} from '../api/types';

/** Mismos límites que los `Field(ge=..., le=...)` del backend. */
export const LIMITS = {
  level: [1, 60],
  promotion_level: [0, 5],
  mindscape_level: [0, 6],
  core_skill_enhancement: [0, 6],
  wengineLevel: [1, 60],
  modification_level: [0, 5],
  phase: [1, 5],
  discLevel: [0, 15],
  /** Procs que recibe el disco entero: 5 en un S. Es el `BreakLevel` de Enka. */
  discProcs: [0, 5],
  /**
   * Las tiradas de un substat, que ya incluyen la inicial (ver `effectiveRolls` en
   * `lib/score.ts`): un substat existe con una tirada y llega a seis, nunca a cero.
   */
  substatRolls: [1, 6],
  skillLevel: [0, 12],
} as const;

export const DISC_SLOTS = [1, 2, 3, 4, 5, 6];
/** Enka solo publica piezas B, A y S; la rareza es parte del id de la pieza. */
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
  /** Id de la pieza que ya tenía el disco, para no perderlo si su set es desconocido. */
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

/**
 * Id de una pieza de disco a partir de su set, su rareza y su slot.
 *
 * Enka no publica las piezas en el catálogo, solo los sets, pero las codifica:
 * el id es `set + rareza*10 + slot` (31000 + 40 + 1 = 31041, un Woodpecker S de slot 1).
 */
export function discGameId(setId: number, rarity: number, slot: number): number {
  return setId + rarity * 10 + slot;
}

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

interface DraftErrorOptions {
  /** El alta manual exige elegir un agente del catálogo; la edición ya lo tiene. */
  requireGameId?: boolean;
}

export function agentDraftErrors(draft: AgentDraft, options: DraftErrorOptions = {}): string[] {
  const errors: string[] = [];

  if (options.requireGameId && !parseId(draft.game_id)) errors.push('Elegí un agente.');
  checkRange(errors, 'El nivel', draft.level, LIMITS.level);
  checkRange(errors, 'La ascensión', draft.promotion_level, LIMITS.promotion_level);
  checkRange(errors, 'El mindscape', draft.mindscape_level, LIMITS.mindscape_level);
  checkRange(
    errors,
    'La habilidad central',
    draft.core_skill_enhancement,
    LIMITS.core_skill_enhancement,
  );

  for (const [key, value] of Object.entries(draft.skill_levels)) {
    if (value.trim() === '') continue;
    checkRange(errors, `La habilidad ${key}`, value, LIMITS.skillLevel);
  }

  if (draft.wengine) {
    if (!parseId(draft.wengine.game_id)) errors.push('Elegí un W-Engine o sacalo del formulario.');
    checkRange(errors, 'El nivel del W-Engine', draft.wengine.level, LIMITS.wengineLevel);
    checkRange(
      errors,
      'La modificación',
      draft.wengine.modification_level,
      LIMITS.modification_level,
    );
    checkRange(errors, 'La fase', draft.wengine.phase, LIMITS.phase);
  }

  for (const disc of draft.discs) {
    if (!disc.equipped) continue;
    const label = `El disco ${disc.slot}`;

    if (!parseId(disc.set_id) && !parseId(disc.known_game_id)) {
      errors.push(`${label}: elegí un set.`);
    }
    checkRange(errors, `${label}: el nivel`, disc.level, LIMITS.discLevel);
    checkRange(errors, `${label}: los rolls`, disc.roll_count, LIMITS.discProcs);
    if (disc.main_stat_id && parseInt(disc.main_stat_value, 10) < 0) {
      errors.push(`${label}: el valor del stat principal no puede ser negativo.`);
    }

    for (const substat of disc.substats) {
      if (!parseId(substat.prop_id)) errors.push(`${label}: hay un substat sin elegir.`);
      checkRange(errors, `${label}: los rolls de un substat`, substat.rolls, LIMITS.substatRolls);
    }

    const props = disc.substats.map((substat) => substat.prop_id).filter(Boolean);
    if (new Set(props).size !== props.length) {
      errors.push(`${label}: hay un substat repetido.`);
    }
  }

  return errors;
}

export function toAgentWrite(draft: AgentDraft): AgentWrite {
  return {
    game_id: parseId(draft.game_id) ?? 0,
    ...buildBody(draft),
  };
}

/**
 * Solo lo que cambió respecto del agente que se está editando.
 *
 * El backend distingue "no vino" de "vino en null": omitir `wengine` lo deja como está y
 * mandarlo en null lo desequipa, así que la comparación con el original es lo que decide.
 */
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

function checkRange(
  errors: string[],
  label: string,
  text: string,
  [min, max]: readonly [number, number],
): void {
  const value = parseInt(text, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    errors.push(`${label} va de ${min} a ${max}.`);
  }
}

/** El id, o `null` si el campo está vacío o no es un número usable. */
function parseId(text: string): number | null {
  const value = parseInt(text, 10);
  return Number.isNaN(value) || value <= 0 ? null : value;
}

function toNumber(text: string, fallback = 0): number {
  const value = parseInt(text, 10);
  return Number.isNaN(value) ? fallback : value;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
