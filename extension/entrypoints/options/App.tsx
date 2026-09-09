import { useEffect, useState, type FormEvent } from 'react';
import { browser } from '#imports';
import {
  DEFAULT_TRACKER_URL,
  normalizeBaseUrl,
  parseAccountKeys,
  STORAGE_KEYS,
  withAccountKey,
  withoutAccountKey,
  type AccountKeys,
} from '../../lib/tracker';

export default function App() {
  const [trackerUrl, setTrackerUrl] = useState('');
  const [frontendUrl, setFrontendUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [saved, setSaved] = useState(false);

  const [accountKeys, setAccountKeys] = useState<AccountKeys>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');
  const [newUid, setNewUid] = useState('');
  const [newKey, setNewKey] = useState('');
  const [keyError, setKeyError] = useState('');

  useEffect(() => {
    void browser.storage.sync
      .get([
        STORAGE_KEYS.trackerUrl,
        STORAGE_KEYS.frontendUrl,
        STORAGE_KEYS.apiToken,
        STORAGE_KEYS.accountKeys,
      ])
      .then((stored) => {
        const storedUrl: unknown = stored[STORAGE_KEYS.trackerUrl];
        const storedFrontendUrl: unknown = stored[STORAGE_KEYS.frontendUrl];
        const storedToken: unknown = stored[STORAGE_KEYS.apiToken];
        if (typeof storedUrl === 'string') setTrackerUrl(storedUrl);
        if (typeof storedFrontendUrl === 'string') setFrontendUrl(storedFrontendUrl);
        if (typeof storedToken === 'string') setApiToken(storedToken);
        setAccountKeys(parseAccountKeys(stored[STORAGE_KEYS.accountKeys]));
      });
  }, []);

  // Un import que rota la key la escribe desde el background: si estas opciones están
  // abiertas en ese momento, la key nueva tiene que aparecer sola.
  useEffect(() => {
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'sync' || !(STORAGE_KEYS.accountKeys in changes)) return;
      setAccountKeys(parseAccountKeys(changes[STORAGE_KEYS.accountKeys]?.newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await browser.storage.sync.set({
      [STORAGE_KEYS.trackerUrl]: normalizeBaseUrl(trackerUrl),
      [STORAGE_KEYS.frontendUrl]: frontendUrl.trim() ? normalizeBaseUrl(frontendUrl) : '',
      [STORAGE_KEYS.apiToken]: apiToken.trim(),
    });
    setSaved(true);
  };

  const persistKeys = async (next: AccountKeys) => {
    setAccountKeys(next);
    await browser.storage.sync.set({ [STORAGE_KEYS.accountKeys]: next });
  };

  const addKey = async (event: FormEvent) => {
    event.preventDefault();
    const uid = newUid.trim();
    const key = newKey.trim();
    if (!uid || !key) {
      setKeyError('Hacen falta el UID y la key.');
      return;
    }
    setKeyError('');
    await persistKeys(withAccountKey(accountKeys, uid, key));
    setNewUid('');
    setNewKey('');
  };

  const copyKey = async (uid: string) => {
    await navigator.clipboard.writeText(accountKeys[uid] ?? '');
    setCopied(uid);
  };

  const uids = Object.keys(accountKeys).sort();

  return (
    <main className="options">
      <h1>ZZZ Tracker — Opciones</h1>
      <form onSubmit={(event) => void save(event)}>
        <label>
          URL del tracker
          <input
            type="url"
            value={trackerUrl}
            placeholder={DEFAULT_TRACKER_URL}
            onChange={(event) => {
              setTrackerUrl(event.target.value);
              setSaved(false);
            }}
            required
          />
        </label>
        <label>
          URL del frontend del tracker (opcional)
          <input
            type="url"
            value={frontendUrl}
            placeholder="sin ella no se muestra el link a la cuenta"
            onChange={(event) => {
              setFrontendUrl(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label>
          Token de la API (ZZZ_API_TOKEN, opcional)
          <input
            type="password"
            value={apiToken}
            placeholder="sólo si el backend lo tiene seteado"
            onChange={(event) => {
              setApiToken(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <button type="submit" className="primary">
          Guardar
        </button>
        {saved && <p className="saved">Guardado.</p>}
      </form>
      <p className="hint">
        El token dejó de ser obligatorio: quien manda es la <strong>key de la cuenta</strong>, que
        el import emite solo. Un token que viaja adentro de una extensión publicada no es un
        secreto, así que no puede ser la única defensa. Completalo únicamente si el backend del
        tracker tiene <code>ZZZ_API_TOKEN</code> seteado, donde sigue siendo una reja extra sobre el
        import.
      </p>

      <h2>Keys de cuenta</h2>
      <p className="hint">
        Cada UID importado tiene una key: es lo que autoriza a escribir esa cuenta. La emite el
        backend la primera vez que se importa ese UID y <strong>se muestra una sola vez</strong>;
        acá queda guardada. Del segundo import en adelante hay que presentarla: una cuenta ya
        verificada no se reclama de nuevo con otro bundle —si no, cualquiera que supiera tu UID se
        quedaría con tu cuenta—, así que un import sin la key vigente responde 403 y no escribe
        nada. Para usar el mismo UID desde otro navegador, copiá la key de acá y pegala allá. Si la
        perdiste del todo, la única salida es <code>zzz-tracker rotate-key &lt;uid&gt;</code> en el
        servidor.
      </p>

      {uids.length === 0 ? (
        <p className="hint">Todavía no hay ninguna key guardada.</p>
      ) : (
        <ul className="keys">
          {uids.map((uid) => (
            <li key={uid}>
              <span className="uid">{uid}</span>
              <input
                type="text"
                readOnly
                className="key"
                value={revealed[uid] ? (accountKeys[uid] ?? '') : '•'.repeat(24)}
                onFocus={(event) => event.target.select()}
              />
              <button
                type="button"
                onClick={() => setRevealed((prev) => ({ ...prev, [uid]: !prev[uid] }))}
              >
                {revealed[uid] ? 'Ocultar' : 'Ver'}
              </button>
              <button type="button" onClick={() => void copyKey(uid)}>
                {copied === uid ? 'Copiada' : 'Copiar'}
              </button>
              <button
                type="button"
                onClick={() => void persistKeys(withoutAccountKey(accountKeys, uid))}
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void addKey(event)}>
        <label>
          UID
          <input
            type="text"
            inputMode="numeric"
            value={newUid}
            placeholder="1500000001"
            onChange={(event) => setNewUid(event.target.value)}
          />
        </label>
        <label>
          Key de la cuenta
          <input
            type="text"
            value={newKey}
            placeholder="zzk_…"
            onChange={(event) => setNewKey(event.target.value)}
          />
        </label>
        <button type="submit" className="primary">
          Guardar la key
        </button>
        {keyError && <p className="error">{keyError}</p>}
      </form>
    </main>
  );
}
