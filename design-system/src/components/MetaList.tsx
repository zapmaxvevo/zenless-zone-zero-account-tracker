import type { HTMLAttributes, ReactNode } from 'react';

export interface MetaItem {
  label: ReactNode;
  value: ReactNode;
}

export interface MetaListProps extends HTMLAttributes<HTMLDListElement> {
  items: MetaItem[];
}

/**
 * Lista de definición en dos columnas para datos de cabecera: nivel, UID, fecha de
 * sincronización. Las etiquetas quedan atenuadas y los valores en monoespaciada,
 * así las cifras alinean verticalmente.
 */
export function MetaList({ items, className, ...rest }: MetaListProps) {
  const classes = ['meta', className].filter(Boolean).join(' ');

  return (
    <dl className={classes} {...rest}>
      {items.map((item, index) => (
        <div key={index} style={{ display: 'contents' }}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
