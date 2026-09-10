import type { CatalogDiscSetRead, CatalogPropertyRead } from '../api/types';
import type { DiscDraft, SubstatDraft } from '../lib/agentDraft';
import { DISC_RARITIES, LIMITS, MAX_SUBSTATS, emptyDiscDraft } from '../lib/agentDraft';
import { rarityLabel } from '../lib/labels';
import { rarityColor } from '../lib/palette';
import '../styles/forms.css';
import Button from './ui/Button';

interface DiscFieldsProps {
  disc: DiscDraft;
  discSets: CatalogDiscSetRead[];
  properties: CatalogPropertyRead[];
  onChange: (disc: DiscDraft) => void;
}

export default function DiscFields({ disc, discSets, properties, onChange }: DiscFieldsProps) {
  function patch(changes: Partial<DiscDraft>) {
    onChange({ ...disc, ...changes });
  }

  function patchSubstat(index: number, changes: Partial<SubstatDraft>) {
    const substats = disc.substats.map((substat, position) =>
      position === index ? { ...substat, ...changes } : substat,
    );
    patch({ substats });
  }

  const grade = disc.equipped ? rarityColor(parseInt(disc.rarity, 10)) : 'var(--border)';

  return (
    <article
      className={`ne-disc ne-cut ne-cut-md ne-disc-fields${disc.equipped ? '' : ' is-empty'}`}
      style={{ ['--grade' as string]: grade }}
    >
      <header className="ne-disc-head">
        <span className={`ne-slot${disc.equipped ? '' : ' ne-slot-empty'}`}>{disc.slot}</span>
        <label className="ne-check">
          <input
            type="checkbox"
            checked={disc.equipped}
            onChange={(event) =>
              event.target.checked
                ? patch({ equipped: true })
                : onChange({ ...emptyDiscDraft(disc.slot), known_game_id: disc.known_game_id })
            }
          />
          Equipado
        </label>
      </header>

      {disc.equipped && (
        <>
          <div className="field">
            <label className="ne-label" htmlFor={`disc-${disc.slot}-set`}>
              Set
            </label>
            <select
              id={`disc-${disc.slot}-set`}
              value={disc.set_id}
              onChange={(event) => patch({ set_id: event.target.value })}
            >
              <option value="">— elegir —</option>
              {discSets.map((set) => (
                <option key={set.set_id} value={set.set_id}>
                  {set.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row ne-field-row">
            <div className="field">
              <label className="ne-label" htmlFor={`disc-${disc.slot}-rarity`}>
                Rango
              </label>
              <select
                id={`disc-${disc.slot}-rarity`}
                value={disc.rarity}
                onChange={(event) => patch({ rarity: event.target.value })}
              >
                {DISC_RARITIES.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarityLabel(rarity)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="ne-label" htmlFor={`disc-${disc.slot}-level`}>
                Nivel
              </label>
              <input
                id={`disc-${disc.slot}-level`}
                type="number"
                min={LIMITS.discLevel[0]}
                max={LIMITS.discLevel[1]}
                value={disc.level}
                onChange={(event) => patch({ level: event.target.value })}
              />
            </div>

            <div className="field">
              <label className="ne-label" htmlFor={`disc-${disc.slot}-rolls`}>
                Rolls
              </label>
              <input
                id={`disc-${disc.slot}-rolls`}
                type="number"
                min={LIMITS.discProcs[0]}
                max={LIMITS.discProcs[1]}
                value={disc.roll_count}
                onChange={(event) => patch({ roll_count: event.target.value })}
              />
            </div>
          </div>

          <div className="field-row ne-field-row">
            <div className="field">
              <label className="ne-label" htmlFor={`disc-${disc.slot}-main`}>
                Stat principal
              </label>
              <select
                id={`disc-${disc.slot}-main`}
                value={disc.main_stat_id}
                onChange={(event) => patch({ main_stat_id: event.target.value })}
              >
                <option value="">— ninguno —</option>
                {properties.map((property) => (
                  <option key={property.prop_id} value={property.prop_id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="ne-label" htmlFor={`disc-${disc.slot}-main-value`}>
                Valor
              </label>
              <input
                id={`disc-${disc.slot}-main-value`}
                type="number"
                min={0}
                value={disc.main_stat_value}
                onChange={(event) => patch({ main_stat_value: event.target.value })}
              />
            </div>
          </div>

          <fieldset className="ne-substats ne-cut ne-cut-md">
            <legend className="ne-label">Substats</legend>
            <p className="ne-prose">Valor crudo de Enka: 480 es 4,8%.</p>

            {disc.substats.map((substat, index) => (
              <div className="field-row ne-field-row" key={index}>
                <div className="field">
                  <select
                    aria-label={`Substat ${index + 1} del disco ${disc.slot}`}
                    value={substat.prop_id}
                    onChange={(event) => patchSubstat(index, { prop_id: event.target.value })}
                  >
                    <option value="">— elegir —</option>
                    {properties.map((property) => (
                      <option key={property.prop_id} value={property.prop_id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <input
                    aria-label={`Valor del substat ${index + 1} del disco ${disc.slot}`}
                    type="number"
                    min={0}
                    value={substat.value}
                    onChange={(event) => patchSubstat(index, { value: event.target.value })}
                  />
                </div>

                <div className="field">
                  <input
                    aria-label={`Rolls del substat ${index + 1} del disco ${disc.slot}`}
                    type="number"
                    min={LIMITS.substatRolls[0]}
                    max={LIMITS.substatRolls[1]}
                    value={substat.rolls}
                    onChange={(event) => patchSubstat(index, { rolls: event.target.value })}
                  />
                </div>

                <Button
                  tone="danger"
                  size="sm"
                  onClick={() =>
                    patch({ substats: disc.substats.filter((_, position) => position !== index) })
                  }
                >
                  Quitar
                </Button>
              </div>
            ))}

            {disc.substats.length < MAX_SUBSTATS && (
              <div className="ne-field-row">
                <Button
                  size="sm"
                  onClick={() =>
                    patch({
                      substats: [
                        ...disc.substats,
                        { prop_id: '', value: '0', rolls: String(LIMITS.substatRolls[0]) },
                      ],
                    })
                  }
                >
                  Agregar substat
                </Button>
              </div>
            )}
          </fieldset>
        </>
      )}
    </article>
  );
}
