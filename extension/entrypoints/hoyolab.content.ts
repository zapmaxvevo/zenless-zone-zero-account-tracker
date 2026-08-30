import { browser, defineContentScript } from '#imports';
import {
  recordCardSection,
  type ChroniclePayloads,
  type RawPayload,
  type ScheduleKey,
} from '../lib/chronicle';
import {
  chronicleUrl,
  fetchHoyolab,
  jitterMs,
  recordCardUrl,
  runSerialized,
  discoverRole,
  sleep,
  userMessage,
  SCHEDULE_CURRENT,
  SCHEDULE_PREVIOUS,
  STOP_KINDS,
  type HoyolabResponse,
  type RoleRef,
} from '../lib/hoyolab';
import {
  failureText,
  type ExtensionMessage,
  type LastImport,
  type ProgressMessage,
  type RunSyncMessage,
  type SectionFailure,
  type SectionId,
  type SectionProgress,
  type SyncResult,
} from '../lib/messages';
import { agentsToFetch, readRoster } from '../lib/roster';
import { collapseBuildFailures, fetchBuilds, type BuildsSync } from '../lib/builds';
import { STORAGE_KEYS } from '../lib/tracker';

export default defineContentScript({
  matches: ['https://act.hoyolab.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as ExtensionMessage;
      if (msg?.type === 'zzz-ping') {
        sendResponse({ pong: true });
        return;
      }
      if (msg?.type === 'zzz-run-sync') {
        runSync(msg)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              role: null,
              sections: {},
              failures: [],
              fatal: { kind: 'error', message: `Falló el sync: ${String(error)}` },
              roster: [],
              fetchedAvatarIds: [],
            } satisfies SyncResult),
          );
        return true;
      }
    });
  },
});

function report(
  section: SectionId,
  status: ProgressMessage['status'],
  detail?: string,
  progress?: SectionProgress,
): void {
  const message: ProgressMessage = { type: 'zzz-progress', section, status, detail, progress };
  void browser.runtime.sendMessage(message).catch(() => {});
}

function logTrace(label: string, response: HoyolabResponse): void {
  console.info(
    `[zzz-tracker] ${label}: http=${response.httpStatus} retcode=${response.retcode} ` +
      `x-trace-id=${response.traceId ?? '-'}`,
  );
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  const value = match?.[1];
  return value == null ? null : decodeURIComponent(value);
}

async function lastKnownUid(): Promise<string | null> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEYS.lastImport);
    const lastImport = stored[STORAGE_KEYS.lastImport] as LastImport | undefined;
    return lastImport?.uid ?? null;
  } catch {
    return null;
  }
}

function failureOf(section: SectionId, response: HoyolabResponse): SectionFailure {
  return {
    section,
    kind: response.kind,
    retcode: response.retcode,
    traceId: response.traceId,
    message: response.message,
  };
}

interface StepSpec {
  id: SectionId;
  url: string;
}

interface StepOutcome {
  id: SectionId;
  response: HoyolabResponse;
}

async function runSync(request: RunSyncMessage): Promise<SyncResult> {
  const { language } = request;
  const failures: SectionFailure[] = [];

  const ltuid = readCookie('ltuid_v2');
  if (!ltuid) {
    report('record_card', 'failed', 'sin cookie ltuid_v2');
    return {
      role: null,
      sections: {},
      failures,
      fatal: { kind: 'invalid_session', message: userMessage('invalid_session') },
      roster: [],
      fetchedAvatarIds: [],
    };
  }

  report('record_card', 'fetching');
  const card = await fetchHoyolab(recordCardUrl(ltuid), { language });
  logTrace('record_card', card);
  if (card.kind === 'invalid_session') {
    report('record_card', 'failed', userMessage('invalid_session'));
    failures.push(failureOf('record_card', card));
    return {
      role: null,
      sections: {},
      failures,
      fatal: { kind: 'invalid_session', message: userMessage('invalid_session', card) },
      roster: [],
      fetchedAvatarIds: [],
    };
  }
  report('record_card', card.kind === 'ok' ? 'done' : 'failed', card.message || undefined);
  if (card.kind !== 'ok') failures.push(failureOf('record_card', card));

  const role: RoleRef | null = discoverRole(card.data, await lastKnownUid());
  if (!role) {
    return {
      role: null,
      sections: {},
      failures,
      fatal: {
        kind: 'no_role',
        message:
          'No se pudo descubrir el UID de ZZZ: getGameRecordCard no trajo la cuenta y no hay un import previo del que caer.',
      },
      roster: [],
      fetchedAvatarIds: [],
    };
  }

  await sleep(jitterMs());

  const specs: StepSpec[] = [
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

  const outcomes = await runSerialized(
    specs.map((spec) => async (): Promise<StepOutcome> => {
      report(spec.id, 'fetching');
      const response = await fetchHoyolab(spec.url, { language });
      logTrace(spec.id, response);
      if (response.kind === 'ok') {
        report(spec.id, 'done');
      } else {
        report(spec.id, 'failed', userMessage(response.kind, response));
        failures.push(failureOf(spec.id, response));
      }
      return { id: spec.id, response };
    }),
    { stopWhen: (outcome) => STOP_KINDS.includes(outcome.response.kind) },
  );

  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome.response]));
  const dataOf = (id: SectionId): RawPayload | null | undefined => {
    const response = byId.get(id);
    if (!response) return undefined;
    return response.kind === 'ok' ? response.data : null;
  };

  const sections: ChroniclePayloads = {};
  // El UID, el nickname y el nivel de la cuenta sólo están acá: `index` no los trae.
  const cardSection = card.kind === 'ok' ? recordCardSection(card.data) : null;
  if (cardSection) sections.record_card = cardSection;
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

  // Las builds van al final: dependen del roster de `avatar/basic` y son un request por
  // agente, así que si algo cortó el sync (sesión, captcha, rate limit) no se intentan.
  const roster = readRoster(sections.avatar_basic);
  const fetchedAvatarIds: number[] = [];
  const mainStopped = STOP_KINDS.includes(outcomes.at(-1)?.response.kind ?? 'ok');
  if (!mainStopped) {
    await sleep(jitterMs());
    const ids = agentsToFetch(roster, request.rosterSnapshot, { reimportAll: request.reimportAll });
    const builds = await runBuilds(role, language, ids);
    if (builds.payloads.length > 0) sections.avatar_info = builds.payloads;
    fetchedAvatarIds.push(...builds.fetchedIds);
    // Una sola advertencia por las builds, no una por agente: ver collapseBuildFailures.
    const collapsed = collapseBuildFailures(builds);
    if (collapsed) failures.push(collapsed);
  }

  // El `fatal` sale SÓLO de las 8 secciones principales: sin `index` no hay import. Un corte
  // durante las builds no lo prende, porque tirar el paquete entero perdería también los
  // agentes que sí viajaron; viaja como warning y el próximo import completa el resto.
  const lastResponse = outcomes.at(-1)?.response;
  const lastKind = lastResponse?.kind;
  const fatal =
    lastKind === 'invalid_session' || lastKind === 'hard_limit'
      ? { kind: lastKind, message: userMessage(lastKind, lastResponse) }
      : null;

  return { role, sections, failures, fatal, roster, fetchedAvatarIds };
}

/** `fetchBuilds` con el progreso y el log de traces que necesita la pestaña. */
async function runBuilds(role: RoleRef, language: string, ids: number[]): Promise<BuildsSync> {
  const total = ids.length;
  if (total === 0) {
    report('avatar_info', 'done', 'sin cambios desde el último import', { done: 0, total: 0 });
    return { payloads: [], fetchedIds: [], failures: [], stopped: null, requested: 0 };
  }

  report('avatar_info', 'fetching', undefined, { done: 0, total });
  const builds = await fetchBuilds({
    role,
    language,
    ids,
    onAgent: ({ id, done, response }) => {
      logTrace(`avatar_info ${id}`, response);
      // Un progreso POR AGENTE, y no uno cada tantos: además de mover el contador del
      // popup, es lo que mantiene vivo al service worker de MV3. El background está
      // esperando la respuesta de `tabs.sendMessage` durante los ~50 s que tarda el roster
      // completo, y Chrome lo termina a los 30 s de inactividad; recibir un mensaje resetea
      // ese timer. A ~1,4 s por agente (request + jitter) alcanza de sobra. Si esto se
      // "optimiza" a un mensaje cada diez agentes, el worker se muere en el medio y se
      // pierde el import entero después de haber hecho los 36 requests a HoYoLAB.
      report('avatar_info', 'fetching', undefined, { done, total });
    },
  });

  // El mismo texto que la advertencia del import: dice cuántas builds faltaron y que
  // reimportando se completan, que es lo único que el usuario puede hacer al respecto.
  const collapsed = collapseBuildFailures(builds);
  const detail = collapsed ? failureText(collapsed) : undefined;
  const progress = { done: builds.fetchedIds.length, total };
  report('avatar_info', builds.stopped ? 'failed' : 'done', detail, progress);
  return builds;
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
