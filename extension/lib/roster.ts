// Sync incremental del roster.
//
// `avatar/info` acepta UN id por request y el roster completo son ~36 agentes: pedirlos
// todos es ~50 s de import. Como `avatar/basic` es un solo request y ya trae `level` y
// `rank` de todos, guardamos un snapshot de esos dos números y sólo pedimos la build de
// los agentes nuevos o que cambiaron. La lógica vive acá (pura, testeable) y no adentro
// del content script.
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
 * Los ids cuya build hay que pedir: los que no están en el snapshot y los que subieron
 * de nivel o de mindscape. Con `reimportAll` se pide el roster entero (hace falta cuando
 * cambia el mapper del backend y hay que rellenar builds ya importadas).
 *
 * Límite conocido: `level` y `rank` es TODO lo que da `avatar/basic`, que no trae nada del
 * equipamiento. Un agente al que le cambiaste los discos o el W-Engine sin subirlo de nivel
 * no se vuelve a pedir. No se puede arreglar desde acá; la salida es "Reimportar todo".
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
 * El snapshot a guardar después de un import exitoso. Un agente sólo avanza a su marca
 * actual si su build viajó de verdad: el que falló conserva la marca vieja (y se vuelve
 * a pedir el próximo import) y el nuevo que falló ni siquiera entra.
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

/**
 * Separa lo que viajó de lo que no: los payloads van al POST y los ids alimentan el
 * snapshot. Un agente sólo cuenta como traído si hay `data`; los fallos parciales se
 * caen acá y el resto del import sigue.
 */
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
