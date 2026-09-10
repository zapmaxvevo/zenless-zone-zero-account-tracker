import type { BangbooRead } from '../api/types';
import { bangbooRankLabel } from '../lib/chronicle';
import { initials, rarityColor } from '../lib/palette';

const STAR_SLOTS = [0, 1, 2, 3, 4];

export default function BangbooCard({ bangboo }: { bangboo: BangbooRead }) {
  const rank = bangbooRankLabel(bangboo.rarity);

  return (
    <article className="ne-boo ne-cut ne-cut-md">
      <div className="ne-boo-art">
        {bangboo.icon ? (
          <img src={bangboo.icon} alt="" loading="lazy" />
        ) : (
          <span className="ne-boo-fallback">{initials(bangboo.name)}</span>
        )}
        {rank && (
          <span
            className="ne-boo-badge"
            style={{ ['--rank' as string]: rarityColor(bangboo.rarity) }}
          >
            {rank}
          </span>
        )}
      </div>

      <span className="ne-value ne-value-lg">{bangboo.name}</span>

      <div className="ne-boo-foot">
        <span className="ne-label ne-label-sm">Nv. {bangboo.level}</span>
        <span className="ne-stars" aria-label={`${bangboo.star} de 5 estrellas`}>
          {STAR_SLOTS.map((slot) => (
            <span
              key={slot}
              className={slot < bangboo.star ? 'ne-star is-on' : 'ne-star'}
              aria-hidden="true"
            >
              ★
            </span>
          ))}
        </span>
      </div>
    </article>
  );
}
