import { browser, defineBackground } from '#imports';
import { buildImportPayload, summarizeImport } from '../lib/chronicle';
import { DEFAULT_LANGUAGE, HOYOLAB_APP_URL, sleep, userMessage } from '../lib/hoyolab';
import type {
  ExtensionMessage,
  ImportDoneMessage,
  ImportOutcome,
  LastImport,
  RunSyncMessage,
  SyncResult,
} from '../lib/messages';
import { accountUrl, postChronicleImport, STORAGE_KEYS, TrackerError } from '../lib/tracker';

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
      runImport()
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

async function runImport(): Promise<ImportOutcome> {
  const stored = await browser.storage.sync.get([
    STORAGE_KEYS.trackerUrl,
    STORAGE_KEYS.frontendUrl,
    STORAGE_KEYS.apiToken,
  ]);
  const storedUrl: unknown = stored[STORAGE_KEYS.trackerUrl];
  const storedFrontendUrl: unknown = stored[STORAGE_KEYS.frontendUrl];
  const storedToken: unknown = stored[STORAGE_KEYS.apiToken];
  const trackerUrl = typeof storedUrl === 'string' ? storedUrl : '';
  const frontendUrl = typeof storedFrontendUrl === 'string' ? storedFrontendUrl : '';
  const apiToken = typeof storedToken === 'string' ? storedToken : '';
  if (!trackerUrl || !apiToken) {
    return {
      ok: false,
      message: 'Configurá la URL del tracker y el token en las opciones de la extensión.',
    };
  }

  const tab = await browser.tabs.create({ url: HOYOLAB_APP_URL, active: false });
  const tabId = tab.id;
  if (tabId == null) return { ok: false, message: 'No se pudo abrir la pestaña de HoYoLAB.' };

  let keepTab = false;
  try {
    await waitForContentScript(tabId);
    const result = (await browser.tabs.sendMessage(tabId, {
      type: 'zzz-run-sync',
      language: DEFAULT_LANGUAGE,
    } satisfies RunSyncMessage)) as SyncResult;

    const warnings = result.failures.map(
      (failure) => `${failure.section}: ${userMessage(failure.kind, failure)}`,
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
    const response = await postChronicleImport({
      settings: { trackerUrl, apiToken },
      uid: result.role.roleId,
      payload,
    });

    const summary = summarizeImport(response);
    // Sin URL del frontend configurada no hay link: la del backend daría un 404 del SPA.
    const url = frontendUrl ? accountUrl(frontendUrl, result.role.roleId) : undefined;
    const lastImport: LastImport = {
      at: new Date().toISOString(),
      uid: result.role.roleId,
      nickname: result.role.nickname,
      summary,
      accountUrl: url,
    };
    await browser.storage.local.set({ [STORAGE_KEYS.lastImport]: lastImport });
    return { ok: true, message: summary, uid: result.role.roleId, accountUrl: url, warnings };
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
