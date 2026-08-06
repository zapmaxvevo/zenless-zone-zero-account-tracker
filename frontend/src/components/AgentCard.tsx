import { Link } from 'react-router-dom';
import type { AgentRead } from '../api/types';
import { elementLabel, nameOr, professionLabel, rarityLabel } from '../lib/labels';

interface AgentCardProps {
  agent: AgentRead;
}

export default function AgentCard({ agent }: AgentCardProps) {
  const name = nameOr(agent.name, 'Agente', agent.game_id);
  const rarity = rarityLabel(agent.rarity);
  const profession = professionLabel(agent.profession);

  return (
    <Link className="agent-card" to={`/account/${agent.account_uid}/agents/${agent.id}`}>
      <div className="agent-card-portrait">
        {agent.icon_url ? (
          <img src={agent.icon_url} alt="" loading="lazy" />
        ) : (
          <span className="agent-card-fallback">{agent.game_id}</span>
        )}
        {rarity && <span className={`rank rank-${rarity}`}>{rarity}</span>}
      </div>

      <div className="agent-card-body">
        <h3>{name}</h3>
        <p className="dim">
          Nv. {agent.level} · M{agent.mindscape_level}
        </p>
        <p className="tags">
          {agent.elements.map((element) => (
            <span key={element} className={`tag element element-${element.toLowerCase()}`}>
              {elementLabel(element)}
            </span>
          ))}
          {profession && <span className="tag">{profession}</span>}
          {agent.source === 'manual' && <span className="tag tag-manual">Manual</span>}
        </p>
        <p className="dim small">
          {agent.wengine
            ? `${nameOr(agent.wengine.name, 'W-Engine', agent.wengine.game_id)} · Nv. ${agent.wengine.level} · P${agent.wengine.phase}`
            : 'Sin W-Engine'}
        </p>
        <p className="dim small">{agent.disc_count} discos</p>
      </div>
    </Link>
  );
}
