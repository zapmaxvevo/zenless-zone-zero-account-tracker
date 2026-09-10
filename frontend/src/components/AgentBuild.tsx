import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { AgentDetailRead, CatalogPropertyRead } from '../api/types';
import { useAccountKey } from '../hooks/useAccountKey';
import { elementIcon, professionIcon, rankIcon } from '../lib/icons';
import { agentRankLabel, elementLabel, nameOr, professionLabel } from '../lib/labels';
import { elementColor, elementsColor, gradeColor, gradeLabel } from '../lib/palette';
import { buildScore } from '../lib/score';
import BuildSetBonus from './BuildSetBonus';
import BuildSkills from './BuildSkills';
import BuildStats from './BuildStats';
import BuildWEngine from './BuildWEngine';
import DiscCard from './DiscCard';
import KeySubsLegend from './KeySubsLegend';
import StatusMessage from './StatusMessage';
import Button, { LinkButton } from './ui/Button';
import Hero from './ui/Hero';
import IconTag from './ui/IconTag';
import SectionHead from './ui/SectionHead';
import '../styles/build.css';

const SLOTS = [1, 2, 3, 4, 5, 6];

interface AgentBuildProps {
  agent: AgentDetailRead;
  uid: string;
  properties: CatalogPropertyRead[];
}

export default function AgentBuild({ agent, uid, properties }: AgentBuildProps) {
  const navigate = useNavigate();
  const { hasKey } = useAccountKey(uid);
  const name = nameOr(agent.name, 'Agente', agent.game_id);
  const rank = agentRankLabel(agent.rarity, agent.game_id);
  const profession = professionLabel(agent.profession);
  const element = elementsColor(agent.elements);
  const icon = agent.elements.length > 0 ? elementIcon(agent.elements[0]) : null;
  const score = buildScore(agent.discs, agent.profession);
  const discsBySlot = new Map(agent.discs.map((disc) => [disc.slot, disc]));
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    const warning =
      `¿Sacar a ${name} del roster? Se borra su build y queda fuera de los equipos ` +
      'que lo tenían, aunque esos equipos siguen existiendo.';
    if (!window.confirm(warning)) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAgent(uid, agent.id);
      navigate(`/account/${uid}/agents`);
    } catch (caught) {
      setDeleteError(describeError(caught));
      setDeleting(false);
    }
  }

  const sets =
    agent.equipped_sets.length === 0
      ? 'Sin set completo'
      : agent.equipped_sets
          .map((set) => `${set.pieces}pz ${nameOr(set.name, 'Set', set.set_id)}`)
          .join(' · ');

  return (
    <>
      <Hero size="md" watermark={rank} beamColor={element} art={agent.image_url}>
        <div className="ne-build-bar">
          <div className="ne-build-bar-group">
            <Link className="ne-ghost" to={`/account/${uid}/agents`}>
              ← Roster
            </Link>
            <span className="ne-label">ID {agent.game_id}</span>
          </div>
          <div className="ne-build-bar-group">
            <LinkButton size="sm" to={`/account/${uid}/agents/${agent.id}/edit`}>
              {hasKey ? 'Editar' : 'Ver los datos'}
            </LinkButton>
            {hasKey && (
              <Button tone="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </Button>
            )}
          </div>
        </div>

        <div className="ne-build-name">
          {icon && <img src={icon} alt="" />}
          <h2 className="ne-display ne-display-xl">{name}</h2>
        </div>

        <p className="ne-label ne-label-lg">
          Nv.{agent.level} · M{agent.mindscape_level} · Núcleo {agent.core_skill_enhancement}
        </p>

        <p className="tags">
          {agent.elements.map((entry) => (
            <IconTag
              key={entry}
              icon={elementIcon(entry)}
              label={elementLabel(entry)}
              tint={elementColor(entry)}
            />
          ))}
          {profession && <IconTag icon={professionIcon(agent.profession)} label={profession} />}
          {rank && <IconTag icon={rankIcon(rank)} label={`Rango ${rank}`} />}
        </p>

        <div className="ne-build-figures">
          <div className="ne-tile ne-tile-ink ne-cut ne-cut-sm">
            <span className="ne-figure ne-figure-xl ne-accent">{score}</span>
            <span className="ne-label ne-label-sm">Score de build</span>
            <span className="ne-label ne-label-sm" style={{ color: gradeColor(score) }}>
              {gradeLabel(score)}
            </span>
          </div>
          <div className="ne-stat-box ne-cut ne-cut-sm">
            <span className="ne-value ne-value-lg">{agent.discs.length}/6</span>
            <span className="ne-label ne-label-sm">Discos equipados</span>
            <span className="ne-label ne-label-sm">{sets}</span>
          </div>
        </div>
      </Hero>

      {deleteError && <StatusMessage kind="error">{deleteError}</StatusMessage>}

      <div className="ne-build-cols">
        <div className="ne-build-side">
          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead title="Estadísticas" small />
            <BuildStats agent={agent} />
          </section>

          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead title="W-Engine" small />
            <BuildWEngine wengine={agent.wengine} />
          </section>

          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead title="Habilidades" small />
            <BuildSkills levels={agent.skill_levels} />
          </section>

          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead title="Sets" count={agent.equipped_sets.length} small />
            {agent.equipped_sets.length === 0 ? (
              <StatusMessage kind="empty">Ningún set completo.</StatusMessage>
            ) : (
              <div className="ne-build-list">
                {agent.equipped_sets.map((set) => (
                  <BuildSetBonus key={set.set_id} set={set} properties={properties} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="ne-build-main">
          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead
              title="Discos"
              count={`${agent.discs.length}/6`}
              action={<KeySubsLegend profession={agent.profession} label={profession} />}
            />
            <div className="ne-grid-discs">
              {SLOTS.map((slot) => (
                <DiscCard
                  key={slot}
                  slot={slot}
                  disc={discsBySlot.get(slot) ?? null}
                  profession={agent.profession}
                  elementColor={element}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
