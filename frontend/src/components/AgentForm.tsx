import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type {
  AgentDetailRead,
  CatalogAgentRead,
  CatalogDiscSetRead,
  CatalogPropertyRead,
  CatalogWEngineRead,
} from '../api/types';
import type { AccountAccess } from '../hooks/useAccountAccess';
import type { AgentDraft } from '../lib/agentDraft';
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
import DiscFields from './DiscFields';
import ReadOnlyNotice from './ReadOnlyNotice';
import StatusMessage from './StatusMessage';
import WEngineFields from './WEngineFields';
import Button from './ui/Button';
import NumberField from './ui/NumberField';
import SectionHead from './ui/SectionHead';
import '../styles/forms.css';

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

export default function AgentForm({
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
