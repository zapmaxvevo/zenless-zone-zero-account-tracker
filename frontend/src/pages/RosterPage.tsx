import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import AgentCard from '../components/AgentCard';
import StatusMessage from '../components/StatusMessage';
import { useApi } from '../hooks/useApi';

export default function RosterPage() {
  const uid = useParams().uid ?? '';
  const { data, error, loading, reload } = useApi(() => api.listAgents(uid), uid);
  const agents = data?.items ?? [];

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Cuentas</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}`}>{uid}</Link> <span className="dim">/ Roster</span>
      </nav>

      <section className="panel">
        <header className="panel-header">
          <h2>Roster ({agents.length})</h2>
          <div className="team-actions">
            <Link className="link-button" to={`/account/${uid}/agents/new`}>
              Agregar agente
            </Link>
            <button type="button" onClick={reload} disabled={loading}>
              Actualizar
            </button>
          </div>
        </header>

        {loading && <StatusMessage kind="loading">Cargando los agentes…</StatusMessage>}

        {!loading && error && (
          <StatusMessage kind="error" onRetry={reload}>
            {error}
          </StatusMessage>
        )}

        {!loading && !error && agents.length === 0 && (
          <StatusMessage kind="empty">
            Esta cuenta no tiene agentes. Enka solo publica los que estén en la vitrina del juego:
            ponelos ahí y sincronizá de nuevo, o cargalos a mano.
          </StatusMessage>
        )}

        <div className="agent-grid">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>
    </>
  );
}
