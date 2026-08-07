import type { HTMLAttributes, ReactNode } from 'react';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** `accent` marca datos cargados a mano; `success` / `danger` son estados. */
  tone?: 'default' | 'accent' | 'success' | 'danger';
  children?: ReactNode;
}

/**
 * Etiqueta redondeada en mayúsculas para metadatos cortos: profesión, especialidad,
 * origen del dato. Agrupá varias dentro de `TagList`.
 */
export function Tag({ tone = 'default', className, children, ...rest }: TagProps) {
  const classes = ['tag', tone !== 'default' && `tag-${tone}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}

export interface TagListProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode;
}

/** Fila que envuelve `Tag`, `ElementTag` y `RankBadge` con el espaciado correcto. */
export function TagList({ className, children, ...rest }: TagListProps) {
  const classes = ['tags', className].filter(Boolean).join(' ');

  return (
    <p className={classes} {...rest}>
      {children}
    </p>
  );
}
