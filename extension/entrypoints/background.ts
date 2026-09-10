import { browser, defineBackground } from '#imports';
import { buildImportPayload, summarizeImport } from '../lib/chronicle';
import { DEFAULT_LANGUAGE, HOYOLAB_APP_URL, sleep } from '../lib/hoyolab';
import {
  failureText,
  type ExtensionMessage,
  type ImportDoneMessage,
  type ImportOutcome,
  type LastImport,
  type RunSyncMessage,
  type SyncResult,
} from '../lib/messages';
import { nextSnapshot, parseSnapshot } from '../lib/roster';
import {
  accountKeyFor,
  accountKeysAfterImport,
  accountUrl,
  parseSettings,
  postChronicleImport,
  SETTINGS_KEYS,
  STORAGE_KEYS,
  TrackerError,
} from '../lib/tracker';

let importRunning = false;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const msg = message as ExtensionMessage;
    if (msg?.type === 'zzz-import-status') {
      sendResponse({ running: importRunning });
      return;
    }
    if (msg?.type === 'zzz-start-import') {
      if (importRunning) {
        sendResponse({ ok: false, message: 'Ya hay un import en curso; esperá a que termine.' });
        return;
      }
      importRunning = true;
      runImport({ reimportAll: msg.reimportAll === true })
        .catch((error): ImportOutcome => ({
          ok: false,
          message: `Falló el import: ${String(error)}`,
        }))
        .then((outcome) => {
          importRunning = false;
          sendResponse(outcome);
          const done: ImportDoneMessage = { type: 'zzz-import-done', outcome };
          void browser.runtime.sendMessage(done).catch(() => {});
        });
      return true;
    }
  });
});

async function runImport(options: { reimportAll: boolean }): Promise<ImportOutcome> {
  // El token es opcional: un backend sin ZZZ_API_TOKEN no lo pide (docs/OWNERSHIP.md).
  const { trackerUrl, frontendUrl, apiToken, accountKeys } = parseSettings(
    await browser.storage.sync.get([...SETTINGS_KEYS]),
  );
  if (!trackerUrl) {
    return {
      ok: false,
      message: 'Configurá la URL del tracker en las opciones de la extensión.',
    };
  }

  // El snapshot vive acá: el content script sólo recibe con qué comparar y devuelve qué trajo.
  const localStored = await browser.storage.local.get(STORAGE_KEYS.rosterSnapshot);
  const rosterSnapshot = options.reimportAll
    ? {}
    : parseSnapshot(localStored[STORAGE_KEYS.rosterSnapshot]);

  const tab = await browser.tabs.create({ url: HOYOLAB_APP_URL, active: false });
  const tabId = tab.id;
  if (tabId == null) return { ok: false, message: 'No se pudo abrir la pestaña de HoYoLAB.' };

  let keepTab = false;
  try {
    await waitForContentScript(tabId);
    const result = (await browser.tabs.sendMessage(tabId, {
      type: 'zzz-run-sync',
      language: DEFAULT_LANGUAGE,
      rosterSnapshot,
      reimportAll: options.reimportAll,
    } satisfies RunSyncMessage)) as SyncResult;

    const warnings = result.failures.map(
      (failure) => `${failure.section}: ${failureText(failure)}`,
    );

    if (result.fatal) {
      if (result.fatal.kind === 'invalid_session') {
        keepTab = true;
        await browser.tabs.update(tabId, { active: true });
      }
      return { ok: false, message: result.fatal.message, warnings };
    }
    if (!result.role || result.sections.index == null) {
      return {
        ok: false,
        message: 'HoYoLAB no devolvió el perfil (index); sin eso el import no es válido.',
        warnings,
      };
    }

    const payload = buildImportPayload({
      region: result.role.server,
      language: DEFAULT_LANGUAGE,
      sections: result.sections,
    });
    const uid = result.role.roleId;
    const response = await postChronicleImport({
      settings: { trackerUrl, apiToken, accountKey: accountKeyFor(accountKeys, uid) },
      uid,
      payload,
    });

    // Si la respuesta trae key hay que persistirla: es la única vez que se puede leer.
    const nextKeys = accountKeysAfterImport(accountKeys, uid, response);
    if (nextKeys !== accountKeys) {
      await browser.storage.sync.set({ [STORAGE_KEYS.accountKeys]: nextKeys });
    }
    const accountKey = accountKeyFor(nextKeys, uid);

    const summary = summarizeImport(response);
    // Sin URL del frontend no hay link: la del backend daría un 404 del SPA.
    const url = frontendUrl ? accountUrl(frontendUrl, uid, accountKey) : undefined;
    const lastImport: LastImport = {
      at: new Date().toISOString(),
      uid,
      nickname: result.role.nickname,
      summary,
      accountUrl: url,
    };
    // Recién ahora: guardarlo antes del POST dejaría al día a agentes que nunca llegaron.
    await browser.storage.local.set({
      [STORAGE_KEYS.lastImport]: lastImport,
      [STORAGE_KEYS.rosterSnapshot]: nextSnapshot({
        previous: rosterSnapshot,
        roster: result.roster,
        fetchedIds: result.fetchedAvatarIds,
      }),
    });
    return { ok: true, message: summary, uid, accountUrl: url, warnings };
  } catch (error) {
    if (error instanceof TrackerError) return { ok: false, message: error.message };
    return { ok: false, message: `Falló el import: ${String(error)}` };
  } finally {
    if (!keepTab) await browser.tabs.remove(tabId).catch(() => {});
  }
}

async function waitForContentScript(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const reply = (await browser.tabs.sendMessage(tabId, { type: 'zzz-ping' })) as {
        pong?: boolean;
      };
      if (reply?.pong) return;
    } catch {
      // La pestaña todavía no cargó el content script.
    }
    await sleep(500);
  }
  throw new Error('La pestaña de HoYoLAB no terminó de cargar.');
}
