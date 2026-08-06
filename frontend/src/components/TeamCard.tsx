import { Link } from 'react-router-dom';
import type { TeamRead } from '../api/types';
import { elementLabel, nameOr } from '../lib/labels';
import { TEAM_SLOTS } from '../lib/teams';

interface TeamCardProps {
  team: TeamRead;
  busy: boolean;
  onDelete: () => void;
}

export default function TeamCard({ team, busy, onDelete }: TeamCardProps) {
  const bySlot = new Map(team.members.map((member) => [member.slot, member.agent]));

  return (
    <article className="team">
      <header className="panel-header">
        <div>
          <h3>{team.name}</h3>
          {team.notes && <p className="dim small">{team.notes}</p>}
        </div>
        <div className="team-actions">
          <Link className="link-button" to={`/account/${team.account_uid}/teams/${team.id}/edit`}>
            Editar
          </Link>
          <button type="button" onClick={onDelete} disabled={busy}>
            {busy ? 'Borrando…' : 'Borrar'}
          </button>
        </div>
      </header>

      <ol className="team-slots">
        {TEAM_SLOTS.map((slot) => {
          const agent = bySlot.get(slot);
          if (!agent) {
            return (
              <li key={slot} className="team-slot team-slot-empty">
                <span className="dim small">Slot {slot} libre</span>
              </li>
            );
          }

          return (
            <li key={slot} className="team-slot">
              <Link to={`/account/${team.account_uid}/agents/${agent.id}`}>
                <span className="team-slot-portrait">
                  {agent.icon_url ? (
                    <img src={agent.icon_url} alt="" loading="lazy" />
                  ) : (
                    <span className="agent-card-fallback">{agent.game_id}</span>
                  )}
                </span>
                <span>
                  <strong>{nameOr(agent.name, 'Agente', agent.game_id)}</strong>
                  <span className="dim small">
                    Nv. {agent.level} · M{agent.mindscape_level}
                    {agent.elements.length > 0 &&
                      ` · ${agent.elements.map(elementLabel).join(', ')}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
