import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type {
  AgentDetailRead,
  CatalogAgentRead,
  CatalogDiscSetRead,
  CatalogPropertyRead,
  CatalogWEngineRead,
} from '../api/types';
import DiscFields from '../components/DiscFields';
import ReadOnlyNotice from '../components/ReadOnlyNotice';
import StatusMessage from '../components/StatusMessage';
import Button from '../components/ui/Button';
import SectionHead from '../components/ui/SectionHead';
import { useAccountAccess } from '../hooks/useAccountAccess';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { useApi } from '../hooks/useApi';
import type { AgentDraft, WEngineDraft } from '../lib/agentDraft';
import {
  LIMITS,
  agentDraftErrors,
  draftFromAgent,
  emptyAgentDraft,
  emptyWEngineDraft,
  toAgentUpdate,
  toAgentWrite,
} from '../lib/agentDraft';
import { SKILL_KEYS, nameOr, skillLabel } from '../lib/labels';
import '../styles/forms.css';

export default function AgentFormPage() {
  const { uid = '', agentId } = useParams();
  const access = useAccountAccess(uid);
  const agent = useApi(
    () => (agentId ? api.getAgent(agentId) : Promise.resolve(null)),
    agentId ?? 'nuevo',
  );
  const catalogAgents = useApi(() => api.catalogAgents(), 'agents');
  const catalogWEngines = useApi(() => api.catalogWEngines(), 'wengines');
  const catalogDiscs = useApi(() => api.catalogDiscSets(), 'discs');
  const catalogProperties = useApi(() => api.catalogProperties(), 'properties');

  const catalogLoading =
    catalogAgents.loading ||
    catalogWEngines.loading ||
    catalogDiscs.loading ||
    catalogProperties.loading;
  const catalogError =
    catalogAgents.error ?? catalogWEngines.error ?? catalogDiscs.error ?? catalogProperties.error;
  const loading = agent.loading || catalogLoading;

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Cuentas</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}`}>{uid}</Link> <span className="dim">/</span>{' '}
        <Link to={`/account/${uid}/agents`}>Roster</Link>{' '}
        <span className="dim">/ {agentId ? 'Editar' : 'Nuevo'}</span>
      </nav>

      {loading && <StatusMessage kind="loading">Cargando…</StatusMessage>}

      {!loading && agent.error && <StatusMessage kind="error">{agent.error}</StatusMessage>}

      {!loading && !agent.error && (
        <AgentForm
          uid={uid}
          access={access}
          agent={agent.data}
          catalogError={catalogError}
          agents={catalogAgents.data?.items ?? []}
          wengines={catalogWEngines.data?.items ?? []}
          discSets={catalogDiscs.data?.items ?? []}
          properties={catalogProperties.data?.items ?? []}
        />
      )}
    </>
  );
}

interface AgentFormProps {
  uid: string;
  access: AccountAccess;
  agent: AgentDetailRead | null;
  catalogError: string | null;
  agents: CatalogAgentRead[];
  wengines: CatalogWEngineRead[];
  discSets: CatalogDiscSetRead[];
  properties: CatalogPropertyRead[];
}

function AgentForm({
  uid,
  access,
  agent,
  catalogError,
  agents,
  wengines,
  discSets,
  properties,
}: AgentFormProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AgentDraft>(() =>
    agent ? draftFromAgent(agent) : emptyAgentDraft(),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = agentDraftErrors(draft, { requireGameId: agent === null });
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      const saved = agent
        ? await api.updateAgent(uid, agent.id, toAgentUpdate(draft, agent))
        : await api.createAgent(uid, toAgentWrite(draft));
      navigate(`/account/${uid}/agents/${saved.id}`);
    } catch (caught) {
      setErrors([describeError(caught)]);
      setSaving(false);
    }
  }

  const skillKeys = [...new Set([...SKILL_KEYS, ...Object.keys(draft.skill_levels)])].sort();
  const equipped = draft.discs.filter((disc) => disc.equipped).length;

  return (
    <form className="ne-stack" onSubmit={handleSubmit}>
      <ReadOnlyNotice access={access} what={agent ? 'editar esta build' : 'cargar un agente'} />

      <fieldset className="ne-lock" disabled={!access.canWrite}>
        <section className="panel">
          <SectionHead
            title={
              agent ? `Editar ${nameOr(agent.name, 'agente', agent.game_id)}` : 'Agregar agente'
            }
          />

          <StatusMessage kind="empty">
            Lo que se carga a mano queda marcado como manual: a partir de ahí el sync con Enka no
            vuelve a pisar este agente.
          </StatusMessage>

          {catalogError && <StatusMessage kind="error">{catalogError}</StatusMessage>}

          {!agent && (
            <div className="field">
              <label className="ne-label" htmlFor="agent-game-id">
                Agente
              </label>
              <select
                id="agent-game-id"
                value={draft.game_id}
                onChange={(event) => setDraft({ ...draft, game_id: event.target.value })}
              >
                <option value="">— elegir —</option>
                {agents.map((option) => (
                  <option key={option.game_id} value={option.game_id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field-row ne-field-row">
            <NumberField
              id="agent-level"
              label="Nivel"
              limits={LIMITS.level}
              value={draft.level}
              onChange={(level) => setDraft({ ...draft, level })}
            />
            <NumberField
              id="agent-promotion"
              label="Ascensión"
              limits={LIMITS.promotion_level}
              value={draft.promotion_level}
              onChange={(promotion_level) => setDraft({ ...draft, promotion_level })}
            />
            <NumberField
              id="agent-mindscape"
              label="Mindscape"
              limits={LIMITS.mindscape_level}
              value={draft.mindscape_level}
              onChange={(mindscape_level) => setDraft({ ...draft, mindscape_level })}
            />
            <NumberField
              id="agent-core"
              label="Hab. central"
              limits={LIMITS.core_skill_enhancement}
              value={draft.core_skill_enhancement}
              onChange={(core_skill_enhancement) => setDraft({ ...draft, core_skill_enhancement })}
            />
          </div>
        </section>

        <section className="panel">
          <SectionHead title="Habilidades" />
          <div className="field-row ne-field-row">
            {skillKeys.map((key) => (
              <NumberField
                key={key}
                id={`agent-skill-${key}`}
                label={skillLabel(key)}
                limits={LIMITS.skillLevel}
                value={draft.skill_levels[key] ?? ''}
                onChange={(value) =>
                  setDraft({ ...draft, skill_levels: { ...draft.skill_levels, [key]: value } })
                }
              />
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionHead
            title="W-Engine"
            action={
              <Button
                size="sm"
                onClick={() =>
                  setDraft({ ...draft, wengine: draft.wengine ? null : emptyWEngineDraft() })
                }
              >
                {draft.wengine ? 'Desequipar' : 'Equipar'}
              </Button>
            }
          />

          {draft.wengine ? (
            <WEngineFields
              wengine={draft.wengine}
              catalog={wengines}
              onChange={(wengine) => setDraft({ ...draft, wengine })}
            />
          ) : (
            <p className="ne-empty">Sin W-Engine equipado</p>
          )}
        </section>

        <section className="panel">
          <SectionHead title="Discos" count={`${equipped}/${draft.discs.length}`} />
          <div className="ne-grid-discs">
            {draft.discs.map((disc, index) => (
              <DiscFields
                key={disc.slot}
                disc={disc}
                discSets={discSets}
                properties={properties}
                onChange={(next) =>
                  setDraft({
                    ...draft,
                    discs: draft.discs.map((current, position) =>
                      position === index ? next : current,
                    ),
                  })
                }
              />
            ))}
          </div>
        </section>
      </fieldset>

      <section className="panel ne-stack">
        {errors.map((message) => (
          <StatusMessage key={message} kind="error">
            {message}
          </StatusMessage>
        ))}

        <div className="ne-actions">
          {access.canWrite && (
            <Button type="submit" tone="accent" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
          <Link
            className="ne-ghost"
            to={agent ? `/account/${uid}/agents/${agent.id}` : `/account/${uid}/agents`}
          >
            {access.canWrite ? 'Cancelar' : 'Volver'}
          </Link>
        </div>
      </section>
    </form>
  );
}

interface WEngineFieldsProps {
  wengine: WEngineDraft;
  catalog: CatalogWEngineRead[];
  onChange: (wengine: WEngineDraft) => void;
}

function WEngineFields({ wengine, catalog, onChange }: WEngineFieldsProps) {
  return (
    <>
      <div className="field">
        <label className="ne-label" htmlFor="wengine-game-id">
          Modelo
        </label>
        <select
          id="wengine-game-id"
          value={wengine.game_id}
          onChange={(event) => onChange({ ...wengine, game_id: event.target.value })}
        >
          <option value="">— elegir —</option>
          {catalog.map((option) => (
            <option key={option.game_id} value={option.game_id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row ne-field-row">
        <NumberField
          id="wengine-level"
          label="Nivel"
          limits={LIMITS.wengineLevel}
          value={wengine.level}
          onChange={(level) => onChange({ ...wengine, level })}
        />
        <NumberField
          id="wengine-mod"
          label="Modificación"
          limits={LIMITS.modification_level}
          value={wengine.modification_level}
          onChange={(modification_level) => onChange({ ...wengine, modification_level })}
        />
        <NumberField
          id="wengine-phase"
          label="Fase"
          limits={LIMITS.phase}
          value={wengine.phase}
          onChange={(phase) => onChange({ ...wengine, phase })}
        />
      </div>
    </>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  limits: readonly [number, number];
  value: string;
  onChange: (value: string) => void;
}

function NumberField({ id, label, limits, value, onChange }: NumberFieldProps) {
  return (
    <div className="field">
      <label className="ne-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={limits[0]}
        max={limits[1]}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
