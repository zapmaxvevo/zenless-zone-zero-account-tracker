import { browser, defineContentScript } from '#imports';
import { recordCardSection } from '../lib/chronicle';
import {
  fetchHoyolab,
  jitterMs,
  recordCardUrl,
  runSerialized,
  discoverRole,
  sleep,
  userMessage,
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
import {
  abortedSync,
  collectSections,
  failureOf,
  fatalFromMain,
  stoppedDuringMain,
  syncSteps,
  type StepOutcome,
} from '../lib/sync';
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
            sendResponse(
              abortedSync({ kind: 'error', message: `Falló el sync: ${String(error)}` }),
            ),
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

async function runSync(request: RunSyncMessage): Promise<SyncResult> {
  const { language } = request;
  const failures: SectionFailure[] = [];

  const ltuid = readCookie('ltuid_v2');
  if (!ltuid) {
    report('record_card', 'failed', 'sin cookie ltuid_v2');
    return abortedSync({ kind: 'invalid_session', message: userMessage('invalid_session') });
  }

  report('record_card', 'fetching');
  const card = await fetchHoyolab(recordCardUrl(ltuid), { language });
  logTrace('record_card', card);
  if (card.kind === 'invalid_session') {
    report('record_card', 'failed', userMessage('invalid_session'));
    failures.push(failureOf('record_card', card));
    return abortedSync(
      { kind: 'invalid_session', message: userMessage('invalid_session', card) },
      failures,
    );
  }
  report('record_card', card.kind === 'ok' ? 'done' : 'failed', card.message || undefined);
  if (card.kind !== 'ok') failures.push(failureOf('record_card', card));

  const role: RoleRef | null = discoverRole(card.data, await lastKnownUid());
  if (!role) {
    return abortedSync(
      {
        kind: 'no_role',
        message:
          'No se pudo descubrir el UID de ZZZ: getGameRecordCard no trajo la cuenta y no hay un import previo del que caer.',
      },
      failures,
    );
  }

  await sleep(jitterMs());

  const outcomes = await runSerialized(
    syncSteps(role).map((spec) => async (): Promise<StepOutcome> => {
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

  const sections = collectSections({
    recordCard: card.kind === 'ok' ? recordCardSection(card.data) : null,
    outcomes,
  });

  // Las builds van al final: dependen del roster de `avatar/basic` y son un request por agente.
  const roster = readRoster(sections.avatar_basic);
  const fetchedAvatarIds: number[] = [];
  if (!stoppedDuringMain(outcomes)) {
    await sleep(jitterMs());
    const ids = agentsToFetch(roster, request.rosterSnapshot, { reimportAll: request.reimportAll });
    const builds = await runBuilds(role, language, ids);
    if (builds.payloads.length > 0) sections.avatar_info = builds.payloads;
    fetchedAvatarIds.push(...builds.fetchedIds);
    const collapsed = collapseBuildFailures(builds);
    if (collapsed) failures.push(collapsed);
  }

  return { role, sections, failures, fatal: fatalFromMain(outcomes), roster, fetchedAvatarIds };
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
    // Un progreso POR AGENTE: es lo que mantiene vivo al service worker de MV3, que Chrome
    // mata a los 30 s de inactividad mientras el background espera los ~50 s del roster.
    onAgent: ({ id, done, response }) => {
      logTrace(`avatar_info ${id}`, response);
      report('avatar_info', 'fetching', undefined, { done, total });
    },
  });

  const collapsed = collapseBuildFailures(builds);
  const detail = collapsed ? failureText(collapsed) : undefined;
  const progress = { done: builds.fetchedIds.length, total };
  report('avatar_info', builds.stopped ? 'failed' : 'done', detail, progress);
  return builds;
}
