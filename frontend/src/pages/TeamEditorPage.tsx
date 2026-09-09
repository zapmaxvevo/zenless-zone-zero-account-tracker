import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { AgentRead, TeamRead } from '../api/types';
import ReadOnlyNotice from '../components/ReadOnlyNotice';
import StatusMessage from '../components/StatusMessage';
import Button, { LinkButton } from '../components/ui/Button';
import Face from '../components/ui/Face';
import SectionHead from '../components/ui/SectionHead';
import { useAccountAccess } from '../hooks/useAccountAccess';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { useAgentArt } from '../hooks/useAgentArt';
import { useApi } from '../hooks/useApi';
import { nameOr } from '../lib/labels';
import { elementsColor, initials } from '../lib/palette';
import { useSync } from '../lib/syncContext';
import type { TeamDraft } from '../lib/teams';
import {
  MAX_TEAM_NAME,
  TEAM_SLOTS,
  draftFromTeam,
  emptyTeamDraft,
  teamErrors,
  toTeamWrite,
} from '../lib/teams';
import '../styles/teams.css';

const PICK_FACE = 56;

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

      {loading && <StatusMessage kind="loading">Cargando…</StatusMessage>}

      {!loading && error && <StatusMessage kind="error">{error}</StatusMessage>}

      {!loading && !error && (
        <TeamForm uid={uid} access={access} team={team.data} roster={roster.data?.items ?? []} />
      )}
    </>
  );
}

interface TeamFormProps {
  uid: string;
  access: AccountAccess;
  team: TeamRead | null;
  roster: AgentRead[];
}

function TeamForm({ uid, access, team, roster }: TeamFormProps) {
  const navigate = useNavigate();
  const { art } = useAgentArt();
  const [draft, setDraft] = useState<TeamDraft>(() =>
    team ? draftFromTeam(team) : emptyTeamDraft(),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const title = team ? 'Editar equipo' : 'Armar equipo';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = teamErrors(draft);
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      const payload = toTeamWrite(draft);
      if (team) {
        await api.updateTeam(uid, team.id, payload);
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
        <SectionHead title={title} />
        <StatusMessage kind="empty">
          Esta cuenta no tiene agentes todavía, así que no hay con quién armar un equipo. Sincronizá
          la cuenta o cargá un agente a mano desde el roster.
        </StatusMessage>
      </section>
    );
  }

  return (
    <form className="panel ne-team-form" onSubmit={handleSubmit}>
      <SectionHead title={title} />

      <ReadOnlyNotice access={access} what="armar equipos" />

      <fieldset className="ne-lock" disabled={!access.canWrite}>
        <div className="ne-team-field">
          <label className="ne-label" htmlFor="team-name">
            Nombre
          </label>
          <input
            id="team-name"
            maxLength={MAX_TEAM_NAME}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </div>

        <div className="ne-team-field">
          <label className="ne-label" htmlFor="team-notes">
            Notas
          </label>
          <textarea
            id="team-notes"
            rows={3}
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </div>

        <div className="ne-team-picks">
          {TEAM_SLOTS.map((slot, index) => {
            const chosen = roster.find((agent) => agent.id === draft.members[index]) ?? null;

            return (
              <div className="ne-team-pick" key={slot}>
                {chosen ? (
                  <Face
                    art={art(chosen.game_id)}
                    fallback={initials(nameOr(chosen.name, 'Agente', chosen.game_id))}
                    ring={elementsColor(chosen.elements)}
                    size={PICK_FACE}
                  />
                ) : (
                  <span
                    className="ne-team-free"
                    style={{ width: PICK_FACE, height: PICK_FACE }}
                    aria-hidden="true"
                  />
                )}

                <div className="ne-team-field">
                  <label className="ne-label" htmlFor={`team-slot-${slot}`}>
                    Slot {slot}
                  </label>
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
              </div>
            );
          })}
        </div>
      </fieldset>

      {errors.map((message) => (
        <StatusMessage key={message} kind="error">
          {message}
        </StatusMessage>
      ))}

      <div className="ne-team-actions">
        {access.canWrite && (
          <Button type="submit" tone="accent" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        )}
        <LinkButton to={`/account/${uid}/teams`}>
          {access.canWrite ? 'Cancelar' : 'Volver'}
        </LinkButton>
      </div>
    </form>
  );
}
