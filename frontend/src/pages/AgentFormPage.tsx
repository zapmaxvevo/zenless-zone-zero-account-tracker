import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import AgentForm from '../components/AgentForm';
import AsyncSection from '../components/ui/AsyncSection';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { useApi } from '../hooks/useApi';

export default function AgentFormPage() {
  const { uid = '', agentId } = useParams();
  const access = useAccountAccess(uid);
  const agent = useApi(
    () => (agentId ? api.getAgent(agentId) : Promise.resolve(null)),
    agentId ?? 'nuevo',
  );
  const catalogAgents = useApi(() => api.catalogAgents(), 'agents');
  const catalogWEngines = useApi(() => api.catalogWEngines(), 'wengines');
  const catalogDiscs = useApi(() => api.catalogDiscSets(), 'discs');
  const catalogProperties = useApi(() => api.catalogProperties(), 'properties');

  const catalogLoading =
    catalogAgents.loading ||
    catalogWEngines.loading ||
    catalogDiscs.loading ||
    catalogProperties.loading;
  const catalogError =
    catalogAgents.error ?? catalogWEngines.error ?? catalogDiscs.error ?? catalogProperties.error;
  const loading = agent.loading || catalogLoading;

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Cuentas</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}`}>{uid}</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}/agents`}>Roster</Link>{' '}
        <span className="dim">/ {agentId ? 'Editar' : 'Nuevo'}</span>
      </nav>

      <AsyncSection state={{ loading, error: agent.error }} loading="Cargando…" />

      {!loading && !agent.error && (
        <AgentForm
          uid={uid}
          access={access}
          agent={agent.data}
          catalogError={catalogError}
          agents={catalogAgents.data?.items ?? []}
          wengines={catalogWEngines.data?.items ?? []}
          discSets={catalogDiscs.data?.items ?? []}
          properties={catalogProperties.data?.items ?? []}
        />
      )}
    </>
  );
}
