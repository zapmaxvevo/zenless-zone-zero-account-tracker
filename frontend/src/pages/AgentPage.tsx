import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { AgentDetailRead, CatalogPropertyRead, EquippedSetRead } from '../api/types';
import DiscCard from '../components/DiscCard';
import StatusMessage from '../components/StatusMessage';
import { useApi } from '../hooks/useApi';
import { elementLabel, nameOr, professionLabel, rarityLabel, skillLabel } from '../lib/labels';
import { formatStatValue } from '../lib/stats';
import { formatDateTime } from '../lib/time';

const SLOTS = [1, 2, 3, 4, 5, 6];

export default function AgentPage() {
  const { uid = '', agentId = '' } = useParams();
  const { data, error, loading, reload } = useApi(() => api.getAgent(agentId), agentId);
  // Los bonus de set vienen como prop id crudo: el catálogo les pone nombre y formato.
  const properties = useApi(() => api.catalogProperties(), 'properties');

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Cuentas</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}`}>{uid}</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}/agents`}>Roster</Link>{' '}
        <span className="dim">/ {data?.name ?? agentId}</span>
      </nav>

      {loading && <StatusMessage kind="loading">Cargando la build…</StatusMessage>}

      {!loading && error && (
        <StatusMessage kind="error" onRetry={reload}>
          {error}
        </StatusMessage>
      )}

      {data && <AgentBuild agent={data} properties={properties.data?.items ?? []} />}
    </>
  );
}

interface AgentBuildProps {
  agent: AgentDetailRead;
  properties: CatalogPropertyRead[];
}

function AgentBuild({ agent, properties }: AgentBuildProps) {
  const name = nameOr(agent.name, 'Agente', agent.game_id);
  const rarity = rarityLabel(agent.rarity);
  const profession = professionLabel(agent.profession);
  const discsBySlot = new Map(agent.discs.map((disc) => [disc.slot, disc]));

  return (
    <>
      <section className="panel agent-hero">
        {agent.image_url && <img className="agent-portrait" src={agent.image_url} alt="" />}
        <div>
          <h2>{name}</h2>
          <p className="tags">
            {rarity && <span className={`tag rank rank-${rarity}`}>{rarity}</span>}
            {agent.elements.map((element) => (
              <span key={element} className={`tag element element-${element.toLowerCase()}`}>
                {elementLabel(element)}
              </span>
            ))}
            {profession && <span className="tag">{profession}</span>}
            {agent.source === 'manual' && <span className="tag">Carga manual</span>}
          </p>
          <dl className="meta">
            <dt>Nivel</dt>
            <dd>
              {agent.level} (asc. {agent.promotion_level})
            </dd>
            <dt>Mindscape</dt>
            <dd>M{agent.mindscape_level}</dd>
            <dt>Habilidad central</dt>
            <dd>{agent.core_skill_enhancement}</dd>
            <dt>Obtenido</dt>
            <dd>{formatDateTime(agent.obtained_at)}</dd>
          </dl>
        </div>
      </section>

      <section className="panel">
        <h3>W-Engine</h3>
        {agent.wengine ? (
          <dl className="meta">
            <dt>Nombre</dt>
            <dd>{nameOr(agent.wengine.name, 'W-Engine', agent.wengine.game_id)}</dd>
            <dt>Rango</dt>
            <dd>{rarityLabel(agent.wengine.rarity) ?? '—'}</dd>
            <dt>Nivel</dt>
            <dd>
              {agent.wengine.level} (mod. {agent.wengine.modification_level})
            </dd>
            <dt>Fase</dt>
            <dd>P{agent.wengine.phase}</dd>
            {agent.weapon_effect_state !== null && (
              <>
                <dt>Estado del efecto</dt>
                <dd>{agent.weapon_effect_state}</dd>
              </>
            )}
          </dl>
        ) : (
          <StatusMessage kind="empty">Este agente no tiene W-Engine equipado.</StatusMessage>
        )}
      </section>

      <section className="panel">
        <h3>Habilidades</h3>
        <dl className="meta">
          {Object.entries(agent.skill_levels).map(([key, level]) => (
            <Fragment key={key}>
              <dt>{skillLabel(key)}</dt>
              <dd>{level}</dd>
            </Fragment>
          ))}
        </dl>
        {Object.keys(agent.skill_levels).length === 0 && (
          <StatusMessage kind="empty">Sin datos de habilidades.</StatusMessage>
        )}
      </section>

      <section className="panel">
        <h3>Sets equipados</h3>
        {agent.equipped_sets.length === 0 ? (
          <StatusMessage kind="empty">Ningún set completo.</StatusMessage>
        ) : (
          <ul className="set-list">
            {agent.equipped_sets.map((set) => (
              <SetBonus key={set.set_id} set={set} properties={properties} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>Discos ({agent.discs.length}/6)</h3>
        <div className="disc-grid">
          {SLOTS.map((slot) => {
            const disc = discsBySlot.get(slot);
            return disc ? (
              <DiscCard key={slot} disc={disc} />
            ) : (
              <article key={slot} className="disc disc-empty">
                <span className="disc-slot">{slot}</span>
                <p className="dim small">Slot vacío</p>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

interface SetBonusProps {
  set: EquippedSetRead;
  properties: CatalogPropertyRead[];
}

function SetBonus({ set, properties }: SetBonusProps) {
  const byId = new Map(properties.map((property) => [String(property.prop_id), property]));
  const bonuses = Object.entries(set.bonus_props);

  return (
    <li className="set">
      {set.icon_url && <img className="set-icon" src={set.icon_url} alt="" />}
      <div>
        <h4>{nameOr(set.name, 'Set', set.set_id)}</h4>
        <p className="dim small">{set.pieces} piezas</p>
        <p className="tags">
          {bonuses.map(([propId, value]) => {
            const property = byId.get(propId);
            return (
              <span key={propId} className="tag">
                {property?.name ?? `Prop ${propId}`} +{formatStatValue(value, property?.format)}
              </span>
            );
          })}
          {bonuses.length === 0 && <span className="dim small">Sin bonus conocido</span>}
        </p>
      </div>
    </li>
  );
}
