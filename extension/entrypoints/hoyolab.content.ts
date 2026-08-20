import { browser, defineContentScript } from '#imports';
import type { ChroniclePayloads, RawPayload, ScheduleKey } from '../lib/chronicle';
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
import type {
  ExtensionMessage,
  LastImport,
  ProgressMessage,
  SectionFailure,
  SectionId,
  SyncResult,
} from '../lib/messages';
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
        runSync(msg.language)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              role: null,
              sections: {},
              failures: [],
              fatal: { kind: 'error', message: `Falló el sync: ${String(error)}` },
            } satisfies SyncResult),
          );
        return true;
      }
    });
  },
});

function report(section: SectionId, status: ProgressMessage['status'], detail?: string): void {
  const message: ProgressMessage = { type: 'zzz-progress', section, status, detail };
  void browser.runtime.sendMessage(message).catch(() => {});
}

function logTrace(section: SectionId, response: HoyolabResponse): void {
  console.info(
    `[zzz-tracker] ${section}: http=${response.httpStatus} retcode=${response.retcode} ` +
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

async function runSync(language: string): Promise<SyncResult> {
  const failures: SectionFailure[] = [];

  const ltuid = readCookie('ltuid_v2');
  if (!ltuid) {
    report('record_card', 'failed', 'sin cookie ltuid_v2');
    return {
      role: null,
      sections: {},
      failures,
      fatal: { kind: 'invalid_session', message: userMessage('invalid_session') },
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

  const lastKind = outcomes.at(-1)?.response.kind;
  const fatal =
    lastKind === 'invalid_session' || lastKind === 'hard_limit'
      ? { kind: lastKind, message: userMessage(lastKind, outcomes.at(-1)?.response) }
      : null;

  return { role, sections, failures, fatal };
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
