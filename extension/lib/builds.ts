// La pasada de builds: un request de `avatar/info` por agente. Un corte acá NO es fatal —el
// paquete ya tiene `index`, roster, bangboos y modos—, así que el import sube incompleto.
import type { RawPayload } from './chronicle';
import {
  avatarInfoUrl,
  fetchHoyolab,
  runSerialized,
  STOP_KINDS,
  type FetchLike,
  type HoyolabResponse,
  type RetcodeKind,
  type RoleRef,
} from './hoyolab';
import type { SectionFailure } from './messages';
import { collectBuilds, type BuildResult } from './roster';

export interface BuildProgressEvent {
  id: number;
  done: number;
  total: number;
  response: HoyolabResponse;
}

/** El fallo de UN agente. Nunca llega al popup así: se colapsa antes. */
export interface BuildFailure extends SectionFailure {
  id: number;
}

export interface BuildsSync {
  payloads: RawPayload[];
  fetchedIds: number[];
  /** Un fallo por agente que no viajó, incluido el que cortó la pasada. */
  failures: BuildFailure[];
  /** La respuesta que cortó la pasada, o null si se recorrieron todos los ids. */
  stopped: HoyolabResponse | null;
  /** Cuántos agentes se pidieron: con un corte, no es `fetchedIds + failures`. */
  requested: number;
}

export async function fetchBuilds(args: {
  role: RoleRef;
  ids: readonly number[];
  language?: string;
  fetchFn?: FetchLike;
  onAgent?: (event: BuildProgressEvent) => void;
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
}): Promise<BuildsSync> {
  const total = args.ids.length;
  const results: BuildResult[] = [];
  const failures: BuildFailure[] = [];
  let done = 0;

  const responses = await runSerialized(
    args.ids.map((id) => async (): Promise<HoyolabResponse> => {
      const response = await fetchHoyolab(avatarInfoUrl(args.role, id), {
        fetchFn: args.fetchFn,
        language: args.language,
      });
      done += 1;
      const data = response.kind === 'ok' ? response.data : null;
      results.push({ id, data });
      if (!data) {
        // Un retcode 0 sin `data` no es un OK: no hay build, y el agente queda pendiente.
        const reason =
          response.kind === 'ok' ? 'respuesta sin datos' : response.message || 'sin detalle';
        failures.push({
          id,
          section: 'avatar_info',
          kind: response.kind,
          retcode: response.retcode,
          traceId: response.traceId,
          message: reason,
        });
      }
      args.onAgent?.({ id, done, total, response });
      return response;
    }),
    {
      stopWhen: (response) => STOP_KINDS.includes(response.kind),
      wait: args.wait,
      random: args.random,
    },
  );

  const last = responses.at(-1) ?? null;
  const stopped = last && STOP_KINDS.includes(last.kind) ? last : null;
  return { ...collectBuilds(results), failures, stopped, requested: total };
}

/**
 * Los fallos de las 36 builds colapsados en UNA advertencia, con el motivo más frecuente y un
 * agente de ejemplo. El faltante se cuenta contra los pedidos, no contra los fallos: un corte
 * deja agentes que nunca se llegaron a pedir y que también están sin build.
 */
export function collapseBuildFailures(builds: BuildsSync): SectionFailure | null {
  const missing = builds.requested - builds.fetchedIds.length;
  if (missing <= 0 || builds.failures.length === 0) return null;

  const byKind = new Map<RetcodeKind, BuildFailure[]>();
  for (const failure of builds.failures) {
    const group = byKind.get(failure.kind);
    if (group) group.push(failure);
    else byKind.set(failure.kind, [failure]);
  }
  const [worst] = [...byKind.values()].sort((a, b) => b.length - a.length);
  const sample = worst![0]!;

  const reason = `${sample.message} (agente ${sample.id})`;
  const detail = byKind.size > 1 ? `${worst!.length} por el mismo motivo: ${reason}` : reason;
  return {
    section: 'avatar_info',
    kind: sample.kind,
    retcode: sample.retcode,
    traceId: sample.traceId,
    message: sample.message,
    // Oración completa y correcta: no pasa por el genérico de `userMessage`.
    text:
      `faltaron ${missing} de ${builds.requested} builds${byKind.size > 1 ? ', ' : ': '}` +
      `${detail}. Volvé a importar para completarlas`,
  };
}
