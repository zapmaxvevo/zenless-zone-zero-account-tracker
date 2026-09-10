import type { TeamRead } from '../api/types';
import { nameOr } from '../lib/labels';
import { elementsColor, initials } from '../lib/palette';
import { rosterScore } from '../lib/score';
import Face from './ui/Face';

const EMPTY = '—';

const FACE = 42;

interface TeamRowProps {
  team: TeamRead;
  art: (gameId: number) => string | null;
}

export default function TeamRow({ team, art }: TeamRowProps) {
  const members = [...team.members].sort((left, right) => left.slot - right.slot);
  const score = members.length
    ? Math.round(
        members.reduce((total, member) => total + rosterScore(member.agent), 0) / members.length,
      )
    : null;

  return (
    <article className="ne-row ne-cut ne-cut-lg">
      <Flares color={elementsColor(members[0]?.agent.elements)} />

      <div className="ne-row-body is-flared">
        <div className="ne-row-main">
          <h4 className="ne-display ne-display-sm">{team.name}</h4>
          <span className="ne-label">
            {members.length} de 3 slots{team.notes && ` · ${team.notes}`}
          </span>
        </div>

        <div className="ne-faces">
          {members.map((member) => (
            <Face
              key={member.slot}
              art={art(member.agent.game_id)}
              fallback={initials(nameOr(member.agent.name, 'Agente', member.agent.game_id))}
              ring={elementsColor(member.agent.elements)}
              size={FACE}
            />
          ))}
        </div>

        <div className="ne-row-figure">
          <span className="ne-label ne-label-sm">Score</span>
          <span className="ne-figure ne-figure-md ne-accent">{score ?? EMPTY}</span>
        </div>
      </div>
    </article>
  );
}

function Flares({ color }: { color: string }) {
  return (
    <span aria-hidden="true">
      <span
        className="ne-row-flare"
        style={{ left: '-4px', width: '7px', ['--flare' as string]: color, opacity: 0.9 }}
      />
      <span
        className="ne-row-flare"
        style={{ left: '10px', width: '4px', ['--flare' as string]: color, opacity: 0.55 }}
      />
      <span
        className="ne-row-flare"
        style={{ left: '19px', width: '2px', ['--flare' as string]: color, opacity: 0.32 }}
      />
    </span>
  );
}
