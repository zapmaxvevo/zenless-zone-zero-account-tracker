import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { AgentRead, TeamRead } from '../api/types';
import StatusMessage from '../components/StatusMessage';
import { useApi } from '../hooks/useApi';
import { nameOr } from '../lib/labels';
import type { TeamDraft } from '../lib/teams';
import {
  MAX_TEAM_NAME,
  TEAM_SLOTS,
  draftFromTeam,
  emptyTeamDraft,
  teamErrors,
  toTeamWrite,
} from '../lib/teams';

export default function TeamEditorPage() {
  const { uid = '', teamId } = useParams();
  const roster = useApi(() => api.listAgents(uid), uid);
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

      {loading && <StatusMessage kind="loading">Cargando…</StatusMessage>}

      {!loading && error && <StatusMessage kind="error">{error}</StatusMessage>}

      {!loading && !error && (
        <TeamForm uid={uid} team={team.data} roster={roster.data?.items ?? []} />
      )}
    </>
  );
}

interface TeamFormProps {
  uid: string;
  team: TeamRead | null;
  roster: AgentRead[];
}

function TeamForm({ uid, team, roster }: TeamFormProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TeamDraft>(() =>
    team ? draftFromTeam(team) : emptyTeamDraft(),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = teamErrors(draft);
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      const payload = toTeamWrite(draft);
      if (team) {
        await api.updateTeam(team.id, payload);
      } else {
        await api.createTeam(uid, payload);
      }
      navigate(`/account/${uid}/teams`);
    } catch (caught) {
      setErrors([describeError(caught)]);
      setSaving(false);
    }
  }

  function chooseMember(index: number, value: string) {
    setDraft((current) => {
      const members = [...current.members];
      members[index] = value ? Number(value) : null;
      return { ...current, members };
    });
  }

  if (roster.length === 0) {
    return (
      <section className="panel">
        <h2>{team ? 'Editar equipo' : 'Armar equipo'}</h2>
        <StatusMessage kind="empty">
          Esta cuenta no tiene agentes todavía, así que no hay con quién armar un equipo. Sincronizá
          la cuenta o cargá un agente a mano desde el roster.
        </StatusMessage>
      </section>
    );
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>{team ? 'Editar equipo' : 'Armar equipo'}</h2>

      <div className="field">
        <label htmlFor="team-name">Nombre</label>
        <input
          id="team-name"
          maxLength={MAX_TEAM_NAME}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="team-notes">Notas</label>
        <textarea
          id="team-notes"
          rows={3}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        />
      </div>

      <div className="slot-fields">
        {TEAM_SLOTS.map((slot, index) => (
          <div className="field" key={slot}>
            <label htmlFor={`team-slot-${slot}`}>Slot {slot}</label>
            <select
              id={`team-slot-${slot}`}
              value={draft.members[index] ?? ''}
              onChange={(event) => chooseMember(index, event.target.value)}
            >
              <option value="">— vacío —</option>
              {roster.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {nameOr(agent.name, 'Agente', agent.game_id)} · Nv. {agent.level}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {errors.map((message) => (
        <StatusMessage key={message} kind="error">
          {message}
        </StatusMessage>
      ))}

      <p className="actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>{' '}
        <Link className="link-button" to={`/account/${uid}/teams`}>
          Cancelar
        </Link>
      </p>
    </form>
  );
}
