import { useCallback, useEffect, useState } from 'react';
import { browser } from '#imports';
import type {
  ImportDoneMessage,
  ImportOutcome,
  LastImport,
  ProgressMessage,
  SectionId,
} from '../../lib/messages';
import { STORAGE_KEYS } from '../../lib/tracker';

const SECTION_ORDER: SectionId[] = [
  'record_card',
  'index',
  'avatar_basic',
  'buddy_info',
  'shiyu_defense_1',
  'shiyu_defense_2',
  'deadly_assault_1',
  'deadly_assault_2',
  'lost_void',
];

const SECTION_LABELS: Record<SectionId, string> = {
  record_card: 'Cuenta HoYoLAB',
  index: 'Perfil',
  avatar_basic: 'Roster de agentes',
  buddy_info: 'Bangboos',
  shiyu_defense_1: 'Shiyu Defense (actual)',
  shiyu_defense_2: 'Shiyu Defense (anterior)',
  deadly_assault_1: 'Deadly Assault (actual)',
  deadly_assault_2: 'Deadly Assault (anterior)',
  lost_void: 'Lost Void',
};

const STATUS_MARKS: Record<ProgressMessage['status'], string> = {
  fetching: '…',
  done: '✓',
  failed: '✗',
};

type Progress = Partial<Record<SectionId, { status: ProgressMessage['status']; detail?: string }>>;

export default function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [lastImport, setLastImport] = useState<LastImport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({});
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const refresh = useCallback(() => {
    void browser.storage.sync
      .get([STORAGE_KEYS.trackerUrl, STORAGE_KEYS.apiToken])
      .then((sync) =>
        setConfigured(Boolean(sync[STORAGE_KEYS.trackerUrl] && sync[STORAGE_KEYS.apiToken])),
      );
    void browser.storage.local
      .get(STORAGE_KEYS.lastImport)
      .then((local) =>
        setLastImport((local[STORAGE_KEYS.lastImport] as LastImport | undefined) ?? null),
      );
  }, []);

  useEffect(() => {
    refresh();
    // Si se cerró el popup a mitad de un import, el background sigue: al reabrir se
    // le pregunta si hay uno en curso para mantener el botón deshabilitado.
    void browser.runtime
      .sendMessage({ type: 'zzz-import-status' })
      .then((reply) => setRunning(Boolean((reply as { running?: boolean } | undefined)?.running)))
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      const msg = message as ProgressMessage | ImportDoneMessage;
      if (msg?.type === 'zzz-progress') {
        setProgress((prev) => ({
          ...prev,
          [msg.section]: { status: msg.status, detail: msg.detail },
        }));
      }
      if (msg?.type === 'zzz-import-done') {
        setOutcome(msg.outcome);
        setRunning(false);
        refresh();
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [refresh]);

  const startImport = async () => {
    setRunning(true);
    setOutcome(null);
    setProgress({});
    try {
      const result = (await browser.runtime.sendMessage({ type: 'zzz-start-import' })) as
        ImportOutcome | undefined;
      setOutcome(result ?? { ok: false, message: 'Sin respuesta del proceso de fondo.' });
    } catch (error) {
      setOutcome({ ok: false, message: `Falló el import: ${String(error)}` });
    } finally {
      setRunning(false);
      refresh();
    }
  };

  const visibleSections = SECTION_ORDER.filter((section) => progress[section]);

  return (
    <main className="popup">
      <h1>ZZZ Tracker</h1>

      {configured === false && (
        <p className="warning">
          Falta configurar la URL del tracker y el token.{' '}
          <button className="link" onClick={() => void browser.runtime.openOptionsPage()}>
            Abrir opciones
          </button>
        </p>
      )}

      <p className="hint">
        Necesitás tener la sesión iniciada en hoyolab.com; se verifica al importar.
      </p>

      <button
        className="primary"
        disabled={running || configured !== true}
        onClick={() => void startImport()}
      >
        {running ? 'Importando…' : 'Importar'}
      </button>

      {visibleSections.length > 0 && (
        <ul className="progress">
          {visibleSections.map((section) => {
            const entry = progress[section]!;
            return (
              <li key={section} className={entry.status}>
                <span className="mark">{STATUS_MARKS[entry.status]}</span>
                <span>{SECTION_LABELS[section]}</span>
                {entry.detail && <span className="detail">{entry.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {outcome && (
        <div className={outcome.ok ? 'outcome ok' : 'outcome error'}>
          <p>{outcome.message}</p>
          {outcome.warnings && outcome.warnings.length > 0 && (
            <ul className="warnings">
              {outcome.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {outcome.ok && outcome.accountUrl && (
            <a href={outcome.accountUrl} target="_blank" rel="noreferrer">
              Ver la cuenta en el tracker
            </a>
          )}
        </div>
      )}

      {lastImport && !outcome && (
        <div className="last-import">
          <h2>Último import</h2>
          <p>
            {lastImport.nickname ? `${lastImport.nickname} — ` : ''}UID {lastImport.uid}
          </p>
          <p>{lastImport.summary}</p>
          <p className="hint">{new Date(lastImport.at).toLocaleString()}</p>
          {lastImport.accountUrl && (
            <a href={lastImport.accountUrl} target="_blank" rel="noreferrer">
              Ver la cuenta en el tracker
            </a>
          )}
        </div>
      )}
    </main>
  );
}
