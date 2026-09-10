import type { CatalogPropertyRead, EquippedSetRead } from '../api/types';
import { nameOr } from '../lib/labels';
import { formatStatValue } from '../lib/stats';

interface BuildSetBonusProps {
  set: EquippedSetRead;
  properties: CatalogPropertyRead[];
}

export default function BuildSetBonus({ set, properties }: BuildSetBonusProps) {
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
