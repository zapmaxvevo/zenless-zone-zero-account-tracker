import type { HTMLAttributes, ReactNode } from 'react';

export interface StatItem {
  label: ReactNode;
  value: ReactNode;
  /** Anotación corta a la derecha del valor, en color acento atenuado (ej. `+3`). */
  note?: ReactNode;
}

export interface StatListProps extends HTMLAttributes<HTMLUListElement> {
  items: StatItem[];
}

/**
 * Lista de estadísticas etiqueta-valor: subestadísticas de un disco, atributos de
 * un agente. El valor va en monoespaciada y alineado a la derecha.
 */
export function StatList({ items, className, ...rest }: StatListProps) {
  const classes = ['stat-list', className].filter(Boolean).join(' ');

  return (
    <ul className={classes} {...rest}>
      {items.map((item, index) => (
        <li key={index}>
          <span className="stat-label">{item.label}</span>
          <span className="stat-value">
            {item.value}
            {item.note !== undefined && <span className="stat-note">{item.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
