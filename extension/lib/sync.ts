// El armado del paquete de import a partir de lo que respondió HoYoLAB. Es lo único del sync
// que no toca `fetch` ni `browser.*`, así que vive acá y el content script sólo orquesta.
import type { ChroniclePayloads, RawPayload, ScheduleKey } from './chronicle';
import {
  chronicleUrl,
  SCHEDULE_CURRENT,
  SCHEDULE_PREVIOUS,
  STOP_KINDS,
  userMessage,
  type HoyolabResponse,
  type RetcodeKind,
  type RoleRef,
} from './hoyolab';
import type { SectionFailure, SectionId, SyncResult } from './messages';

export interface StepSpec {
  id: SectionId;
  url: string;
}

export interface StepOutcome {
  id: SectionId;
  response: HoyolabResponse;
}

/** Las 8 secciones principales, en el orden en que se piden. Las builds van después. */
export function syncSteps(role: RoleRef): StepSpec[] {
  return [
    { id: 'index', url: chronicleUrl('index', role) },
    { id: 'avatar_basic', url: chronicleUrl('avatar_basic', role) },
    { id: 'buddy_info', url: chronicleUrl('buddy_info', role) },
    {
      id: 'shiyu_defense_1',
      url: chronicleUrl('shiyu_defense', role, { schedule_type: SCHEDULE_CURRENT }),
    },
    {
      id: 'shiyu_defense_2',
      url: chronicleUrl('shiyu_defense', role, { schedule_type: SCHEDULE_PREVIOUS }),
    },
    {
      id: 'deadly_assault_1',
      url: chronicleUrl('deadly_assault', role, { schedule_type: SCHEDULE_CURRENT }),
    },
    {
      id: 'deadly_assault_2',
      url: chronicleUrl('deadly_assault', role, { schedule_type: SCHEDULE_PREVIOUS }),
    },
    { id: 'lost_void', url: chronicleUrl('lost_void', role) },
  ];
}

export function failureOf(section: SectionId, response: HoyolabResponse): SectionFailure {
  return {
    section,
    kind: response.kind,
    retcode: response.retcode,
    traceId: response.traceId,
    message: response.message,
  };
}

function scheduled(
  current: RawPayload | null | undefined,
  previous: RawPayload | null | undefined,
): Partial<Record<ScheduleKey, RawPayload | null>> | null {
  if (current === undefined && previous === undefined) return null;
  const result: Partial<Record<ScheduleKey, RawPayload | null>> = {};
  if (current !== undefined) result['1'] = current;
  if (previous !== undefined) result['2'] = previous;
  return result;
}

/**
 * Las secciones del paquete a partir de las respuestas. Una sección que falló viaja como
 * `null` y una que un corte dejó sin pedir no aparece: son dos cosas distintas para el backend.
 */
export function collectSections(args: {
  recordCard: RawPayload | null;
  outcomes: readonly StepOutcome[];
}): ChroniclePayloads {
  const byId = new Map(args.outcomes.map((outcome) => [outcome.id, outcome.response]));
  const dataOf = (id: SectionId): RawPayload | null | undefined => {
    const response = byId.get(id);
    if (!response) return undefined;
    return response.kind === 'ok' ? response.data : null;
  };

  const sections: ChroniclePayloads = {};
  if (args.recordCard) sections.record_card = args.recordCard;
  const index = dataOf('index');
  if (index !== undefined) sections.index = index;
  const avatarBasic = dataOf('avatar_basic');
  if (avatarBasic !== undefined) sections.avatar_basic = avatarBasic;
  const buddyInfo = dataOf('buddy_info');
  if (buddyInfo !== undefined) sections.buddy_info = buddyInfo;
  const shiyu = scheduled(dataOf('shiyu_defense_1'), dataOf('shiyu_defense_2'));
  if (shiyu) sections.shiyu_defense = shiyu;
  const deadly = scheduled(dataOf('deadly_assault_1'), dataOf('deadly_assault_2'));
  if (deadly) sections.deadly_assault = deadly;
  const lostVoid = dataOf('lost_void');
  if (lostVoid !== undefined) sections.lost_void = lostVoid;
  return sections;
}

/** Si la última de las 8 secciones cortó la pasada, no se intentan las builds. */
export function stoppedDuringMain(outcomes: readonly StepOutcome[]): boolean {
  return STOP_KINDS.includes(outcomes.at(-1)?.response.kind ?? ('ok' as RetcodeKind));
}

/**
 * El `fatal` sale SÓLO de las 8 secciones principales: sin `index` no hay import. Un corte
 * durante las builds no lo prende, porque tirar el paquete perdería las que sí viajaron.
 */
export function fatalFromMain(outcomes: readonly StepOutcome[]): SyncResult['fatal'] {
  const last = outcomes.at(-1)?.response;
  const kind = last?.kind;
  if (kind !== 'invalid_session' && kind !== 'hard_limit') return null;
  return { kind, message: userMessage(kind, last) };
}

/** El `SyncResult` de un sync que ni llegó a descubrir el rol. */
export function abortedSync(
  fatal: NonNullable<SyncResult['fatal']>,
  failures: SectionFailure[] = [],
): SyncResult {
  return { role: null, sections: {}, failures, fatal, roster: [], fetchedAvatarIds: [] };
}
