import { skillIcon } from '../lib/icons';
import { SKILL_KEYS, skillLabel } from '../lib/labels';

const EMPTY = '—';

export default function BuildSkills({ levels }: { levels: Record<string, number> }) {
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
            <span className="ne-value ne-value-lg">{levels[key] ?? EMPTY}</span>
          </div>
        );
      })}
    </div>
  );
}
