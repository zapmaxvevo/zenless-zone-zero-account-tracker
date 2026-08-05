import type { DriveDiscRead } from '../api/types';
import { nameOr, rarityLabel } from '../lib/labels';
import { formatStat, statLabel } from '../lib/stats';

interface DiscCardProps {
  disc: DriveDiscRead;
}

export default function DiscCard({ disc }: DiscCardProps) {
  const rarity = rarityLabel(disc.rarity);

  return (
    <article className="disc">
      <header className="disc-header">
        <span className="disc-slot">{disc.slot}</span>
        {disc.set_icon_url && <img className="disc-icon" src={disc.set_icon_url} alt="" />}
        <div>
          <h4>
            {disc.set_id === null
              ? `Disco ${disc.game_id}`
              : nameOr(disc.set_name, 'Set', disc.set_id)}
          </h4>
          <p className="dim small">
            {rarity && `${rarity} · `}Nv. {disc.level}
          </p>
        </div>
      </header>

      {disc.main_stat ? (
        <p className="disc-main">
          <span>{statLabel(disc.main_stat)}</span>
          <strong>{formatStat(disc.main_stat)}</strong>
        </p>
      ) : (
        <p className="dim small">Sin stat principal</p>
      )}

      <ul className="substats">
        {disc.substats.map((substat) => (
          <li key={substat.prop_id}>
            <span>{statLabel(substat)}</span>
            <span className="substat-value">
              {formatStat(substat)}
              {substat.rolls > 0 && <span className="rolls">+{substat.rolls}</span>}
            </span>
          </li>
        ))}
        {disc.substats.length === 0 && <li className="dim small">Sin substats</li>}
      </ul>
    </article>
  );
}
