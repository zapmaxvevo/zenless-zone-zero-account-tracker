import type { HTMLAttributes } from 'react';

/** Escala de rareza de ZZZ, de mayor a menor. */
export type Rank = 'S' | 'A' | 'B';

export interface RankBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  rank: Rank;
}

/**
 * Insignia de rareza. Dentro de `EntityCard` se ancla sola a la esquina inferior
 * derecha del retrato, así que pasala por la prop `rank` de la tarjeta en vez de
 * componerla a mano.
 */
export function RankBadge({ rank, className, ...rest }: RankBadgeProps) {
  const classes = ['rank', `rank-${rank}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {rank}
    </span>
  );
}
