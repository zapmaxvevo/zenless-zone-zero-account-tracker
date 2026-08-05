import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './App.css';
import { api } from './api/client';
import { useApi } from './hooks/useApi';
import AccountPage from './pages/AccountPage';
import AgentPage from './pages/AgentPage';
import HomePage from './pages/HomePage';
import RosterPage from './pages/RosterPage';

export default function App() {
  return (
    <BrowserRouter>
      <main className="app">
        <header className="app-header">
          <h1>
            <Link to="/">ZZZ Tracker</Link>
          </h1>
          <p className="dim">Cuentas, agentes y builds de Zenless Zone Zero.</p>
        </header>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/account/:uid" element={<AccountPage />} />
          <Route path="/account/:uid/agents" element={<RosterPage />} />
          <Route path="/account/:uid/agents/:agentId" element={<AgentPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>

        <BackendStatus />
      </main>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <section className="panel">
      <h2>No hay nada acá</h2>
      <p className="dim">
        La dirección no corresponde a ninguna pantalla. <Link to="/">Volver al inicio</Link>.
      </p>
    </section>
  );
}

function BackendStatus() {
  const { data, error, loading } = useApi(() => api.health());

  return (
    <footer className="app-footer dim small">
      {loading && 'Consultando el backend…'}
      {!loading && error && (
        <span className="status-offline">
          <span className="dot" aria-hidden="true" /> Backend offline — {error}
        </span>
      )}
      {!loading && data && (
        <span className="status-online">
          <span className="dot" aria-hidden="true" /> {data.app} {data.version} · {data.status}
        </span>
      )}
    </footer>
  );
}
