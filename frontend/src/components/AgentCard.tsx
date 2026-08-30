import type { AgentRead } from '../api/types';
import { elementIcon, professionIcon } from '../lib/icons';
import { agentRankLabel, elementLabel, nameOr, professionLabel } from '../lib/labels';
import { elementColor, elementsColor, rankColor } from '../lib/palette';
import { rosterScore } from '../lib/score';
import '../styles/roster.css';
import IconTag from './ui/IconTag';
import PortraitCard from './ui/PortraitCard';

interface AgentCardProps {
  agent: AgentRead;
  /** Arte de cuerpo entero, resuelto una sola vez por la página (`useAgentArt`). */
  art?: string | null;
}

/**
 * Un agente del roster como card de retrato (regla 10 de docs/DESIGN.md).
 *
 * Todo lo que se ve sale del dato: el rango tiñe la marca de agua, el atributo tiñe la
 * banda y trae su icono, y la píldora amarilla lleva el score aproximado del build.
 * Atributo y especialidad se muestran con el icono del juego, no con el nombre (regla 7).
 */
export default function AgentCard({ agent, art = null }: AgentCardProps) {
  const name = nameOr(agent.name, 'Agente', agent.game_id);
  const profession = professionLabel(agent.profession);
  const element = agent.elements[0] ?? null;
  const rank = agentRankLabel(agent.rarity, agent.game_id);

  return (
    <PortraitCard
      to={`/account/${agent.account_uid}/agents/${agent.id}`}
      name={name}
      art={art}
      fallback={agent.game_id}
      rank={rank}
      rankColor={rankColor(rank)}
      elementColor={elementsColor(agent.elements)}
      elementIcon={element && elementIcon(element)}
      meta={`Nv. ${agent.level} · M${agent.mindscape_level} · ${agent.disc_count} discos`}
      score={rosterScore(agent)}
      tags={
        <span className="ne-tag-row">
          {agent.elements.map((each) => (
            <IconTag
              key={each}
              icon={elementIcon(each)}
              label={elementLabel(each)}
              tint={elementColor(each)}
            />
          ))}
          {profession && <IconTag icon={professionIcon(agent.profession)} label={profession} />}
        </span>
      }
      footNote={
        agent.wengine
          ? `${nameOr(agent.wengine.name, 'W-Engine', agent.wengine.game_id)} · Nv. ${agent.wengine.level} · P${agent.wengine.phase}`
          : 'Sin W-Engine'
      }
    />
  );
}
