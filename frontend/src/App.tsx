import './App.css';
import { api } from './api/client';
import { useApi } from './hooks/useApi';

function BackendStatus() {
  const { data, error, loading, reload } = useApi(() => api.health());

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Backend</h2>
        <button type="button" onClick={reload} disabled={loading}>
          {loading ? 'Consultando…' : 'Reintentar'}
        </button>
      </header>

      {loading && <p className="dim">Consultando el estado del backend…</p>}

      {!loading && error && (
        <p className="status status-offline">
          <span className="dot" aria-hidden="true" /> Offline — {error}
        </p>
      )}

      {!loading && data && (
        <>
          <p className="status status-online">
            <span className="dot" aria-hidden="true" /> Online
          </p>
          <dl className="meta">
            <dt>Servicio</dt>
            <dd>{data.app}</dd>
            <dt>Versión</dt>
            <dd>{data.version}</dd>
            <dt>Estado</dt>
            <dd>{data.status}</dd>
          </dl>
        </>
      )}
    </section>
  );
}

export default function App() {
  return (
    <main className="app">
      <h1>ZZZ Tracker</h1>
      <p className="dim">Cuentas, agentes y builds de Zenless Zone Zero.</p>
      <BackendStatus />
    </main>
  );
}
