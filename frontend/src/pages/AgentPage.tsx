import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { AgentDetailRead, CatalogPropertyRead, EquippedSetRead } from '../api/types';
import DiscCard from '../components/DiscCard';
import SourceTag from '../components/SourceTag';
import StatusMessage from '../components/StatusMessage';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import { elementIcon, skillIcon } from '../lib/icons';
import {
  SKILL_KEYS,
  elementLabel,
  nameOr,
  professionLabel,
  rarityLabel,
  skillLabel,
} from '../lib/labels';
import { elementColor, elementsColor, gradeColor, gradeLabel } from '../lib/palette';
import type { SubKey } from '../lib/score';
import { buildScore, keySubs } from '../lib/score';
import { formatStatValue } from '../lib/stats';
import { useSync } from '../lib/syncContext';
import { formatDateTime } from '../lib/time';
import '../styles/build.css';

const SLOTS = [1, 2, 3, 4, 5, 6];

/** Nombres de la leyenda: los de `lib/score.ts` son claves del modelo, no texto de pantalla. */
const SUB_NAMES: Record<SubKey, string> = {
  crit: 'Prob. CRIT',
  critdmg: 'DAÑO CRIT',
  atkp: 'ATQ%',
  atk: 'ATQ',
  pen: 'PEN',
  ap: 'Dominio de anomalía',
  hpp: 'PV%',
  hp: 'PV',
  defp: 'DEF%',
  def: 'DEF',
};

export default function AgentPage() {
  const { uid = '', agentId = '' } = useParams();
  const { version } = useSync();
  const { data, error, loading, reload } = useApi(
    () => api.getAgent(agentId),
    `${agentId}:${version}`,
  );
  // Los bonus de set vienen como prop id crudo: el catálogo les pone nombre y formato.
  const properties = useApi(() => api.catalogProperties(), 'properties');

  return (
    <>
      {loading && <StatusMessage kind="loading">Cargando la build…</StatusMessage>}

      {!loading && error && (
        <StatusMessage kind="error" onRetry={reload}>
          {error}
        </StatusMessage>
      )}

      {data && <AgentBuild agent={data} uid={uid} properties={properties.data?.items ?? []} />}
    </>
  );
}

interface AgentBuildProps {
  agent: AgentDetailRead;
  uid: string;
  properties: CatalogPropertyRead[];
}

function AgentBuild({ agent, uid, properties }: AgentBuildProps) {
  const navigate = useNavigate();
  const name = nameOr(agent.name, 'Agente', agent.game_id);
  const rarity = rarityLabel(agent.rarity);
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
      await api.deleteAgent(agent.id);
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
      <Hero size="md" watermark={rarity} beamColor={element} art={agent.image_url}>
        <div className="ne-build-bar">
          <div className="ne-build-bar-group">
            <Link className="ne-ghost" to={`/account/${uid}/agents`}>
              ← Roster
            </Link>
            <span className="ne-label">ID {agent.game_id}</span>
          </div>
          <div className="ne-build-bar-group">
            <Link
              className="zui-button zui-button-sm"
              to={`/account/${uid}/agents/${agent.id}/edit`}
            >
              Editar
            </Link>
            <button
              type="button"
              className="zui-button zui-button-sm zui-button-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </button>
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
            <span
              key={entry}
              className="tag ne-tag-tint"
              style={{ ['--tint' as string]: elementColor(entry) }}
            >
              {elementLabel(entry)}
            </span>
          ))}
          {profession && <span className="tag">{profession}</span>}
          {rarity && <span className={`tag rank rank-${rarity}`}>{rarity}</span>}
          <SourceTag source={agent.source} />
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
            <Stats agent={agent} />
          </section>

          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead title="W-Engine" small />
            <WEngine agent={agent} />
          </section>

          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead title="Habilidades" small />
            <Skills levels={agent.skill_levels} />
          </section>

          <section className="ne-build-panel ne-cut ne-cut-lg">
            <SectionHead title="Sets" count={agent.equipped_sets.length} small />
            {agent.equipped_sets.length === 0 ? (
              <StatusMessage kind="empty">Ningún set completo.</StatusMessage>
            ) : (
              <div className="ne-build-list">
                {agent.equipped_sets.map((set) => (
                  <SetBonus key={set.set_id} set={set} properties={properties} />
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

/**
 * Lo que la API expone del agente, tal cual.
 *
 * El detalle no trae stats calculadas (ATQ, CRIT, PV finales): Enka publica las piezas, no
 * el total, así que acá van los datos crudos y ninguno inventado.
 */
function Stats({ agent }: { agent: AgentDetailRead }) {
  const rows: [string, string][] = [
    ['Nivel', `${agent.level}`],
    ['Ascensión', `${agent.promotion_level}`],
    ['Mindscape', `M${agent.mindscape_level}`],
    ['Habilidad central', `${agent.core_skill_enhancement}`],
    ['W-Engine', agent.wengine ? `Nv.${agent.wengine.level} · Fase ${agent.wengine.phase}` : '—'],
    ['Efecto de arma', agent.weapon_effect_state === null ? '—' : `${agent.weapon_effect_state}`],
    ['Obtenido', agent.obtained_at ? formatDateTime(agent.obtained_at) : '—'],
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

function WEngine({ agent }: { agent: AgentDetailRead }) {
  const wengine = agent.wengine;
  if (!wengine) return <StatusMessage kind="empty">Sin W-Engine equipado.</StatusMessage>;

  const rank = rarityLabel(wengine.rarity);

  return (
    <div className="ne-build-list">
      <div className="ne-section-title">
        <span className="ne-tick ne-tick-sm" aria-hidden="true" />
        <span className="ne-display ne-display-sm">
          {nameOr(wengine.name, 'W-Engine', wengine.game_id)}
        </span>
      </div>
      <span className="ne-label">
        Nv.{wengine.level} · Fase {wengine.phase}
      </span>
      <span className="ne-label">
        Mod. {wengine.modification_level}
        {rank && ` · Rango ${rank}`}
      </span>
    </div>
  );
}

function Skills({ levels }: { levels: Record<string, number> }) {
  // Primero las seis de siempre, en el orden del juego; después cualquier índice nuevo.
  const extra = Object.keys(levels).filter((key) => !SKILL_KEYS.includes(key));

  return (
    <div>
      {[...SKILL_KEYS, ...extra].map((key) => {
        const icon = skillIcon(key);
        return (
          <div key={key} className="ne-stat-row">
            <span className="ne-build-skill ne-label ne-label-lg">
              {icon && <img src={icon} alt="" />}
              {skillLabel(key)}
            </span>
            <span className="ne-value ne-value-lg">{levels[key] ?? '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

interface KeySubsLegendProps {
  /** La especialidad cruda de Enka, que es con la que trabaja el modelo de score. */
  profession: string | null;
  label: string | null;
}

function KeySubsLegend({ profession, label }: KeySubsLegendProps) {
  const names = keySubs(profession)
    .map((key) => SUB_NAMES[key])
    .join(', ');

  return (
    <div className="ne-build-key">
      <span className="ne-build-key-swatch" aria-hidden="true" />
      <span className="ne-label ne-label-sm">
        Subestadísticas que suman al score de {label ?? 'la especialidad'}: {names}
      </span>
    </div>
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
    <div className="ne-stat-box">
      <div className="ne-build-set">
        {set.icon_url && <img src={set.icon_url} alt="" />}
        <span className="ne-value">{nameOr(set.name, 'Set', set.set_id)}</span>
        <span className="ne-label ne-label-sm">{set.pieces} pz</span>
      </div>
      <p className="tags">
        {bonuses.map(([propId, value]) => {
          const property = byId.get(propId);
          return (
            <span key={propId} className="tag">
              {property?.name ?? `Prop ${propId}`} +{formatStatValue(value, property?.format)}
            </span>
          );
        })}
        {bonuses.length === 0 && <span className="ne-label ne-label-sm">Sin bonus conocido</span>}
      </p>
    </div>
  );
}
