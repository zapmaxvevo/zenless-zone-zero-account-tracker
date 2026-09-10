import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { AgentRead } from '../api/types';
import AgentCard from '../components/AgentCard';
import StatusMessage from '../components/StatusMessage';
import { LinkButton } from '../components/ui/Button';
import SectionHead from '../components/ui/SectionHead';
import { useAccountKey } from '../hooks/useAccountKey';
import { useAgentArt } from '../hooks/useAgentArt';
import { useApi } from '../hooks/useApi';
import { elementLabel, nameOr, professionLabel } from '../lib/labels';
import { rosterScore } from '../lib/score';
import { useSync } from '../lib/syncContext';
import '../styles/roster.css';

type Order = 'score' | 'level' | 'name';

interface Option {
  value: string;
  label: string;
}

function options(values: readonly (string | null)[], label: (value: string) => string): Option[] {
  const present = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return present
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function agentName(agent: AgentRead): string {
  return nameOr(agent.name, 'Agente', agent.game_id);
}

export default function RosterPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();
  const { data, error, loading, reload } = useApi(() => api.listAgents(uid), `${uid}:${version}`);
  const { art } = useAgentArt();
  const { hasKey } = useAccountKey(uid);

  const [search, setSearch] = useState('');
  const [element, setElement] = useState('');
  const [profession, setProfession] = useState('');
  const [order, setOrder] = useState<Order>('score');

  const agents = useMemo(() => data?.items ?? [], [data]);

  const elements = useMemo(
    () =>
      options(
        agents.flatMap((agent) => agent.elements),
        elementLabel,
      ),
    [agents],
  );

  const professions = useMemo(
    () =>
      options(
        agents.map((agent) => agent.profession),
        (value) => professionLabel(value) ?? value,
      ),
    [agents],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = agents.filter((agent) => {
      if (element && !agent.elements.includes(element)) return false;
      if (profession && agent.profession !== profession) return false;
      return !query || agentName(agent).toLowerCase().includes(query);
    });

    return [...matching].sort((a, b) => {
      if (order === 'level') return b.level - a.level || agentName(a).localeCompare(agentName(b));
      if (order === 'name') return agentName(a).localeCompare(agentName(b));
      return rosterScore(b) - rosterScore(a) || agentName(a).localeCompare(agentName(b));
    });
  }, [agents, search, element, profession, order]);

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

      {agents.length > 0 && (
        <>
          <div className="field-row ne-filters">
            <div className="field">
              <label className="ne-label" htmlFor="roster-search">
                Buscar
              </label>
              <input
                id="roster-search"
                type="search"
                value={search}
                placeholder="Nombre del agente"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="field">
              <label className="ne-label" htmlFor="roster-element">
                Atributo
              </label>
              <select
                id="roster-element"
                value={element}
                onChange={(event) => setElement(event.target.value)}
              >
                <option value="">Todos</option>
                {elements.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="ne-label" htmlFor="roster-profession">
                Especialidad
              </label>
              <select
                id="roster-profession"
                value={profession}
                onChange={(event) => setProfession(event.target.value)}
              >
                <option value="">Todas</option>
                {professions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="ne-label" htmlFor="roster-order">
                Orden
              </label>
              <select
                id="roster-order"
                value={order}
                onChange={(event) => setOrder(event.target.value as Order)}
              >
                <option value="score">Score de build</option>
                <option value="level">Nivel</option>
                <option value="name">Nombre</option>
              </select>
            </div>
          </div>

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
