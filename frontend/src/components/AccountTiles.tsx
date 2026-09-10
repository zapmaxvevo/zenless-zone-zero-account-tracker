import type { AccountRead, AgentRead } from '../api/types';
import { gradeColor, gradeLabel } from '../lib/palette';
import Tile from './ui/Tile';

const EMPTY = '—';

const TOP_RARITY = 4;

interface AccountTilesProps {
  account: AccountRead;
  agents: AgentRead[];
  score: number | null;
}

export default function AccountTiles({ account, agents, score }: AccountTilesProps) {
  const roster = agents.length;
  const topRank = agents.filter((agent) => agent.rarity === TOP_RARITY).length;
  const discs = agents.reduce((total, agent) => total + agent.disc_count, 0);
  const withoutEngine = agents.filter((agent) => agent.wengine === null).length;
  const level = roster
    ? Math.round(agents.reduce((total, agent) => total + agent.level, 0) / roster)
    : null;

  return (
    <div className="ne-grid-tiles">
      <div className="ne-tile ne-tile-ink ne-tile-ring ne-cut ne-cut-md">
        <span
          className="ne-ring"
          style={{ ['--ring-turn' as string]: `${(score ?? 0) / 100}turn` }}
        >
          <span className="ne-figure ne-figure-md">{score ?? EMPTY}</span>
        </span>
        <span className="ne-tile-ring-body">
          <span className="ne-label ne-label-sm">Score de cuenta</span>
          <span
            className="ne-label"
            style={score === null ? undefined : { color: gradeColor(score) }}
          >
            {score === null ? EMPTY : gradeLabel(score)}
          </span>
        </span>
      </div>

      <Tile
        label="Agentes"
        value={account.agent_count}
        note={roster ? `${topRank} en rango S` : EMPTY}
      />
      <Tile
        label="Discos"
        value={roster ? discs : EMPTY}
        note={
          roster ? (withoutEngine ? `${withoutEngine} sin W-Engine` : 'Todos con W-Engine') : EMPTY
        }
      />
      <Tile label="Nivel medio" value={level ?? EMPTY} note="Tope 60" />
    </div>
  );
}
