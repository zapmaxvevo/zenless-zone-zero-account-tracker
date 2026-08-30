import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { AgentRead, TeamRead } from '../api/types';
import type { AgentArt } from '../hooks/useAgentArt';
import { nameOr } from '../lib/labels';
import { elementsColor, gradeColor, gradeLabel, initials } from '../lib/palette';
import { rosterScore } from '../lib/score';
import { teamSynergy } from '../lib/synergy';
import { TEAM_SLOTS } from '../lib/teams';
import Face from './ui/Face';

interface TeamCardProps {
  team: TeamRead;
  busy: boolean;
  /** El arte de cuerpo entero, pedido una sola vez por la pantalla. */
  art: AgentArt['art'];
  onDelete: () => void;
}

/** Las tres franjas del borde izquierdo: van juntas o no van (regla 2 de docs/DESIGN.md). */
const FLARES = [
  { left: -10, width: 8, opacity: 0.6 },
  { left: 8, width: 5, opacity: 0.34 },
  { left: 21, width: 3, opacity: 0.18 },
];

const FACE = 76;

export default function TeamCard({ team, busy, art, onDelete }: TeamCardProps) {
  const bySlot = new Map(team.members.map((member) => [member.slot, member.agent]));
  const present = TEAM_SLOTS.map((slot) => bySlot.get(slot)).filter(
    (agent): agent is AgentRead => agent !== undefined,
  );

  const score = average(present.map(rosterScore));
  const level = average(present.map((agent) => agent.level));
  const synergy = teamSynergy(present);
  // La franja toma el elemento del primer miembro, no un promedio (regla 7).
  const flare = elementsColor(present[0]?.elements);

  return (
    <article className="ne-row ne-cut ne-cut-lg ne-team-row">
      <span aria-hidden="true">
        {FLARES.map((stripe) => (
          <span
            key={stripe.left}
            className="ne-row-flare"
            style={
              {
                left: stripe.left,
                width: stripe.width,
                opacity: stripe.opacity,
                '--flare': flare,
              } as CSSProperties
            }
          />
        ))}
      </span>

      <div className="ne-team-main">
        <div className="ne-team-head">
          <h3 className="ne-display ne-display-md">{team.name}</h3>
          {team.notes && <p className="ne-prose">{team.notes}</p>}
        </div>

        <ol className="ne-team-slots">
          {TEAM_SLOTS.map((slot) => {
            const agent = bySlot.get(slot);

            if (!agent) {
              return (
                <li key={slot}>
                  <div className="ne-team-slot">
                    <span
                      className="ne-team-free"
                      style={{ width: FACE, height: FACE }}
                      aria-hidden="true"
                    />
                    <span className="ne-label ne-label-sm ne-team-slot-name">Libre</span>
                  </div>
                </li>
              );
            }

            const name = nameOr(agent.name, 'Agente', agent.game_id);

            return (
              <li key={slot}>
                <Link
                  className="ne-team-slot"
                  to={`/account/${team.account_uid}/agents/${agent.id}`}
                >
                  <Face
                    art={art(agent.game_id)}
                    fallback={initials(name)}
                    ring={elementsColor(agent.elements)}
                    size={FACE}
                    badge={rosterScore(agent)}
                  />
                  <span className="ne-label ne-label-sm ne-team-slot-name">{name}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="ne-team-side">
        <div className="ne-team-score-box">
          <span className="ne-label ne-label-sm">Score</span>
          <div className="ne-team-score-row">
            <span
              className={`ne-figure ne-figure-lg ne-team-score ${
                score === null ? 'ne-team-dim' : 'ne-accent'
              }`}
            >
              {score ?? '—'}
            </span>
            <span
              className="ne-value"
              style={score === null ? undefined : { color: gradeColor(score) }}
            >
              {score === null ? '—' : gradeLabel(score)}
            </span>
          </div>
        </div>

        <div>
          <StatRow label="Nivel medio" value={level ?? '—'} />
          <StatRow label="Miembros" value={`${present.length}/${TEAM_SLOTS.length}`} />
          <StatRow label="Sinergia" value={synergy.label} />
        </div>

        <div className="ne-team-actions">
          <Link
            className="zui-button zui-button-sm"
            to={`/account/${team.account_uid}/teams/${team.id}/edit`}
          >
            Editar
          </Link>
          <button
            type="button"
            className="zui-button zui-button-sm zui-button-danger"
            onClick={onDelete}
            disabled={busy}
          >
            {busy ? 'Borrando…' : 'Borrar'}
          </button>
        </div>
      </div>
    </article>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ne-stat-row">
      <span className="ne-label">{label}</span>
      <span className="ne-value">{value}</span>
    </div>
  );
}

/** Promedio redondeado, o `null` si no hay de qué promediar: el bloque se dibuja igual. */
function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}
