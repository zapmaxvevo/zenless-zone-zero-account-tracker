import type { CatalogDiscSetRead, CatalogPropertyRead } from '../api/types';
import type { DiscDraft, SubstatDraft } from '../lib/agentDraft';
import { DISC_RARITIES, LIMITS, MAX_SUBSTATS, emptyDiscDraft } from '../lib/agentDraft';
import { rarityLabel } from '../lib/labels';

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

  return (
    <article className={`disc ${disc.equipped ? '' : 'disc-empty'}`}>
      <header className="disc-header">
        <span className="disc-slot">{disc.slot}</span>
        <label className="checkbox">
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
            <label htmlFor={`disc-${disc.slot}-set`}>Set</label>
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

          <div className="field-row">
            <div className="field">
              <label htmlFor={`disc-${disc.slot}-rarity`}>Rango</label>
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
              <label htmlFor={`disc-${disc.slot}-level`}>Nivel</label>
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
              <label htmlFor={`disc-${disc.slot}-rolls`}>Rolls</label>
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

          <div className="field-row">
            <div className="field">
              <label htmlFor={`disc-${disc.slot}-main`}>Stat principal</label>
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
              <label htmlFor={`disc-${disc.slot}-main-value`}>Valor</label>
              <input
                id={`disc-${disc.slot}-main-value`}
                type="number"
                min={0}
                value={disc.main_stat_value}
                onChange={(event) => patch({ main_stat_value: event.target.value })}
              />
            </div>
          </div>

          <fieldset className="substat-fields">
            <legend className="dim small">Substats (valor crudo de Enka: 480 es 4,8%)</legend>

            {disc.substats.map((substat, index) => (
              <div className="field-row" key={index}>
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

                <button
                  type="button"
                  onClick={() =>
                    patch({ substats: disc.substats.filter((_, position) => position !== index) })
                  }
                >
                  Quitar
                </button>
              </div>
            ))}

            {disc.substats.length < MAX_SUBSTATS && (
              <button
                type="button"
                onClick={() =>
                  patch({ substats: [...disc.substats, { prop_id: '', value: '0', rolls: '0' }] })
                }
              >
                Agregar substat
              </button>
            )}
          </fieldset>
        </>
      )}
    </article>
  );
}
