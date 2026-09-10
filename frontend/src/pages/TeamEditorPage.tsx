import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import TeamForm from '../components/TeamForm';
import AsyncSection from '../components/ui/AsyncSection';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { useApi } from '../hooks/useApi';
import { useSync } from '../lib/syncContext';

export default function TeamEditorPage() {
  const { uid = '', teamId } = useParams();
  const access = useAccountAccess(uid);
  const { version } = useSync();
  const roster = useApi(() => api.listAgents(uid), `${uid}:${version}`);
  const team = useApi(
    () => (teamId ? api.getTeam(teamId) : Promise.resolve(null)),
    teamId ?? 'nuevo',
  );

  const loading = roster.loading || team.loading;
  const error = roster.error ?? team.error;

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Cuentas</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}`}>{uid}</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}/teams`}>Equipos</Link>{' '}
        <span className="dim">/ {teamId ? 'Editar' : 'Nuevo'}</span>
      </nav>

      <AsyncSection state={{ loading, error }} loading="Cargando…" />

      {!loading && !error && (
        <TeamForm uid={uid} access={access} team={team.data} roster={roster.data?.items ?? []} />
      )}
    </>
  );
}
