import type { AgentDetailRead } from '../api/types';
import { formatDateTime } from '../lib/time';

const EMPTY = '—';

export default function BuildStats({ agent }: { agent: AgentDetailRead }) {
  const rows: [string, string][] = [
    ['Nivel', `${agent.level}`],
    ['Ascensión', `${agent.promotion_level}`],
    ['Mindscape', `M${agent.mindscape_level}`],
    ['Habilidad central', `${agent.core_skill_enhancement}`],
    ['W-Engine', agent.wengine ? `Nv.${agent.wengine.level} · Fase ${agent.wengine.phase}` : EMPTY],
    ['Efecto de arma', agent.weapon_effect_state === null ? EMPTY : `${agent.weapon_effect_state}`],
    ['Obtenido', agent.obtained_at ? formatDateTime(agent.obtained_at) : EMPTY],
  ];

  return (
    <div>
      {rows.map(([label, value]) => (
        <div key={label} className="ne-stat-row">
          <span className="ne-label ne-label-lg">{label}</span>
          <span className="ne-value ne-value-lg">{value}</span>
        </div>
      ))}
    </div>
  );
}
