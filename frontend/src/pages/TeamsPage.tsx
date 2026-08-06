import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { TeamRead } from '../api/types';
import StatusMessage from '../components/StatusMessage';
import TeamCard from '../components/TeamCard';
import { useApi } from '../hooks/useApi';

export default function TeamsPage() {
  const uid = useParams().uid ?? '';
  const { data, error, loading, reload } = useApi(() => api.listTeams(uid), uid);
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const teams = data?.items ?? [];

  async function handleDelete(team: TeamRead) {
    if (!window.confirm(`¿Borrar el equipo "${team.name}"? Los agentes siguen en el roster.`)) {
      return;
    }

    setRemoving(team.id);
    setRemoveError(null);
    try {
      await api.deleteTeam(team.id);
      reload();
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
        <header className="panel-header">
          <h2>Equipos ({teams.length})</h2>
          <Link className="link-button" to={`/account/${uid}/teams/new`}>
            Armar equipo
          </Link>
        </header>

        {loading && <StatusMessage kind="loading">Cargando los equipos…</StatusMessage>}

        {!loading && error && (
          <StatusMessage kind="error" onRetry={reload}>
            {error}
          </StatusMessage>
        )}

        {removeError && <StatusMessage kind="error">{removeError}</StatusMessage>}

        {!loading && !error && teams.length === 0 && (
          <StatusMessage kind="empty">
            Todavía no armaste ningún equipo para esta cuenta.
          </StatusMessage>
        )}

        <div className="team-list">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              busy={removing === team.id}
              onDelete={() => handleDelete(team)}
            />
          ))}
        </div>
      </section>
    </>
  );
}
