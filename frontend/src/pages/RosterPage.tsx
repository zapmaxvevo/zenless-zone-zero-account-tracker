import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import AgentCard from '../components/AgentCard';
import RosterFilters from '../components/RosterFilters';
import StatusMessage from '../components/StatusMessage';
import AsyncSection from '../components/ui/AsyncSection';
import { LinkButton } from '../components/ui/Button';
import SectionHead from '../components/ui/SectionHead';
import { useAccountKey } from '../hooks/useAccountKey';
import { useAgentArt } from '../hooks/useAgentArt';
import { useApi } from '../hooks/useApi';
import type { RosterFilter } from '../lib/roster';
import { elementOptions, emptyRosterFilter, professionOptions, visibleAgents } from '../lib/roster';
import { useSync } from '../lib/syncContext';
import '../styles/roster.css';

export default function RosterPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();
  const roster = useApi(() => api.listAgents(uid), `${uid}:${version}`);
  const { art } = useAgentArt();
  const { hasKey } = useAccountKey(uid);

  const [filter, setFilter] = useState<RosterFilter>(emptyRosterFilter);

  const agents = useMemo(() => roster.data?.items ?? [], [roster.data]);
  const elements = useMemo(() => elementOptions(agents), [agents]);
  const professions = useMemo(() => professionOptions(agents), [agents]);
  const visible = useMemo(() => visibleAgents(agents, filter), [agents, filter]);

  return (
    <section className="panel">
      <SectionHead
        title="Roster"
        count={visible.length}
        action={
          hasKey && (
            <LinkButton tone="accent" size="sm" to={`/account/${uid}/agents/new`}>
              Agregar agente
            </LinkButton>
          )
        }
      />

      <AsyncSection
        state={roster}
        loading="Cargando los agentes…"
        isEmpty={agents.length === 0}
        empty="Esta cuenta no tiene agentes. Enka solo publica los que estén en la vitrina del juego: ponelos ahí y sincronizá de nuevo, o cargalos a mano."
      />

      {agents.length > 0 && (
        <>
          <RosterFilters
            filter={filter}
            elements={elements}
            professions={professions}
            onChange={setFilter}
          />

          {visible.length === 0 ? (
            <StatusMessage kind="empty">Ningún agente coincide con el filtro.</StatusMessage>
          ) : (
            <div className="ne-grid-cards">
              {visible.map((agent) => (
                <AgentCard key={agent.id} agent={agent} art={art(agent.game_id)} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
