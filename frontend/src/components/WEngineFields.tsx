import type { CatalogWEngineRead } from '../api/types';
import type { WEngineDraft } from '../lib/agentDraft';
import { LIMITS } from '../lib/agentDraft';
import NumberField from './ui/NumberField';

interface WEngineFieldsProps {
  wengine: WEngineDraft;
  catalog: CatalogWEngineRead[];
  onChange: (wengine: WEngineDraft) => void;
}

export default function WEngineFields({ wengine, catalog, onChange }: WEngineFieldsProps) {
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
