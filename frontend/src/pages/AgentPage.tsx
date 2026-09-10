import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import AgentBuild from '../components/AgentBuild';
import AsyncSection from '../components/ui/AsyncSection';
import { useApi } from '../hooks/useApi';
import { useSync } from '../lib/syncContext';

export default function AgentPage() {
  const { uid = '', agentId = '' } = useParams();
  const { version } = useSync();
  const agent = useApi(() => api.getAgent(agentId), `${agentId}:${version}`);
  const properties = useApi(() => api.catalogProperties(), 'properties');

  return (
    <>
      <AsyncSection state={agent} loading="Cargando la build…" />

      {agent.data && (
        <AgentBuild agent={agent.data} uid={uid} properties={properties.data?.items ?? []} />
      )}
    </>
  );
}
