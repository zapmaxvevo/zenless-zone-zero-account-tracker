import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { TeamRead } from '../api/types';
import StatusMessage from '../components/StatusMessage';
import TeamCard from '../components/TeamCard';
import AsyncSection from '../components/ui/AsyncSection';
import { LinkButton } from '../components/ui/Button';
import SectionHead from '../components/ui/SectionHead';
import { useAccountKey } from '../hooks/useAccountKey';
import { useAgentArt } from '../hooks/useAgentArt';
import { useApi } from '../hooks/useApi';
import { useSync } from '../lib/syncContext';
import '../styles/teams.css';

export default function TeamsPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();
  const saved = useApi(() => api.listTeams(uid), `${uid}:${version}`);
  const { art } = useAgentArt();
  const { hasKey } = useAccountKey(uid);
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const teams = saved.data?.items ?? [];

  async function handleDelete(team: TeamRead) {
    if (!window.confirm(`¿Borrar el equipo "${team.name}"? Los agentes siguen en el roster.`)) {
      return;
    }

    setRemoving(team.id);
    setRemoveError(null);
    try {
      await api.deleteTeam(uid, team.id);
      saved.reload();
    } catch (caught) {
      setRemoveError(describeError(caught));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Cuentas</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}`}>{uid}</Link> <span className="dim">/ Equipos</span>
      </nav>

      <section className="panel">
        <SectionHead
          title="Equipos"
          count={teams.length}
          action={
            hasKey && (
              <LinkButton tone="accent" size="sm" to={`/account/${uid}/teams/new`}>
                Armar equipo
              </LinkButton>
            )
          }
        />

        <AsyncSection
          state={saved}
          loading="Cargando los equipos…"
          isEmpty={teams.length === 0}
          empty="Todavía no armaste ningún equipo para esta cuenta."
        />

        {removeError && <StatusMessage kind="error">{removeError}</StatusMessage>}

        <div className="ne-stack">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              art={art}
              busy={removing === team.id}
              onDelete={hasKey ? () => handleDelete(team) : undefined}
            />
          ))}
        </div>
      </section>
    </>
  );
}
