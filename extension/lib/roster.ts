// Sync incremental del roster: `avatar/info` es un id por request y son ~36 agentes (~50 s),
// así que se diffea contra el `{level, rank}` que trae `avatar/basic` en un solo request.
import type { RawPayload } from './chronicle';

export interface RosterAgent {
  id: number;
  level: number;
  rank: number;
  name?: string;
}

export interface RosterMark {
  level: number;
  rank: number;
}

/** Lo que se persiste entre imports: `{ id del agente: { level, rank } }`. */
export type RosterSnapshot = Record<string, RosterMark>;

/** Lee el `avatar_list` de `avatar/basic`; ignora las entradas sin id numérico. */
export function readRoster(avatarBasic: RawPayload | null | undefined): RosterAgent[] {
  const list = (avatarBasic as { avatar_list?: unknown } | null | undefined)?.avatar_list;
  if (!Array.isArray(list)) return [];
  const agents: RosterAgent[] = [];
  for (const entry of list) {
    const avatar = entry as { id?: unknown; level?: unknown; rank?: unknown; name_mi18n?: unknown };
    const id = Number(avatar.id);
    if (!Number.isFinite(id)) continue;
    const agent: RosterAgent = {
      id,
      level: Number(avatar.level) || 0,
      rank: Number(avatar.rank) || 0,
    };
    if (typeof avatar.name_mi18n === 'string' && avatar.name_mi18n) agent.name = avatar.name_mi18n;
    agents.push(agent);
  }
  return agents;
}

function sameMark(mark: RosterMark | undefined, agent: RosterAgent): boolean {
  return mark != null && mark.level === agent.level && mark.rank === agent.rank;
}

/**
 * Los ids cuya build hay que pedir: los nuevos y los que subieron de nivel o de mindscape.
 * `avatar/basic` no trae nada del equipamiento, así que un cambio de discos sin subir de
 * nivel NO se detecta: la única salida es `reimportAll`.
 */
export function agentsToFetch(
  roster: readonly RosterAgent[],
  snapshot: RosterSnapshot,
  options: { reimportAll?: boolean } = {},
): number[] {
  if (options.reimportAll) return roster.map((agent) => agent.id);
  return roster.filter((agent) => !sameMark(snapshot[String(agent.id)], agent)).map((a) => a.id);
}

/**
 * El snapshot a guardar después de un import exitoso: un agente sólo avanza a su marca
 * actual si su build viajó de verdad, así el que falló se vuelve a pedir el próximo import.
 */
export function nextSnapshot(args: {
  previous: RosterSnapshot;
  roster: readonly RosterAgent[];
  fetchedIds: readonly number[];
}): RosterSnapshot {
  const fetched = new Set(args.fetchedIds);
  const snapshot: RosterSnapshot = {};
  for (const agent of args.roster) {
    const key = String(agent.id);
    if (fetched.has(agent.id)) {
      snapshot[key] = { level: agent.level, rank: agent.rank };
      continue;
    }
    const previous = args.previous[key];
    // Sin marca previa el agente queda fuera: es nuevo y su build todavía no se importó.
    if (previous) snapshot[key] = previous;
  }
  return snapshot;
}

export interface BuildResult {
  id: number;
  /** El `data` crudo de `avatar/info`, o null si el request falló o vino vacío. */
  data: RawPayload | null;
}

/** Separa lo que viajó de lo que no: los payloads van al POST y los ids al snapshot. */
export function collectBuilds(results: readonly BuildResult[]): {
  payloads: RawPayload[];
  fetchedIds: number[];
} {
  const payloads: RawPayload[] = [];
  const fetchedIds: number[] = [];
  for (const result of results) {
    if (!result.data) continue;
    payloads.push(result.data);
    fetchedIds.push(result.id);
  }
  return { payloads, fetchedIds };
}

/** Valida lo que sale de `storage.local`, que puede ser cualquier cosa. */
export function parseSnapshot(value: unknown): RosterSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const snapshot: RosterSnapshot = {};
  for (const [key, mark] of Object.entries(value as Record<string, unknown>)) {
    const entry = mark as { level?: unknown; rank?: unknown } | null;
    if (typeof entry?.level !== 'number' || typeof entry?.rank !== 'number') continue;
    snapshot[key] = { level: entry.level, rank: entry.rank };
  }
  return snapshot;
}
