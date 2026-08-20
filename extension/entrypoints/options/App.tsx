import { useEffect, useState, type FormEvent } from 'react';
import { browser } from '#imports';
import { DEFAULT_TRACKER_URL, normalizeBaseUrl, STORAGE_KEYS } from '../../lib/tracker';

export default function App() {
  const [trackerUrl, setTrackerUrl] = useState('');
  const [frontendUrl, setFrontendUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void browser.storage.sync
      .get([STORAGE_KEYS.trackerUrl, STORAGE_KEYS.frontendUrl, STORAGE_KEYS.apiToken])
      .then((stored) => {
        const storedUrl: unknown = stored[STORAGE_KEYS.trackerUrl];
        const storedFrontendUrl: unknown = stored[STORAGE_KEYS.frontendUrl];
        const storedToken: unknown = stored[STORAGE_KEYS.apiToken];
        if (typeof storedUrl === 'string') setTrackerUrl(storedUrl);
        if (typeof storedFrontendUrl === 'string') setFrontendUrl(storedFrontendUrl);
        if (typeof storedToken === 'string') setApiToken(storedToken);
      });
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
          Token de la API (ZZZ_API_TOKEN)
          <input
            type="password"
            value={apiToken}
            onChange={(event) => {
              setApiToken(event.target.value);
              setSaved(false);
            }}
            required
          />
        </label>
        <button type="submit" className="primary">
          Guardar
        </button>
        {saved && <p className="saved">Guardado.</p>}
      </form>
      <p className="hint">
        El token tiene que coincidir con la variable ZZZ_API_TOKEN del backend del tracker; sin él
        el endpoint de import rechaza la petición.
      </p>
    </main>
  );
}
