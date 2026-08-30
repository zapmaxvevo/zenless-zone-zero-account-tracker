import type { ReactNode } from 'react';

interface SectionHeadProps {
  title: string;
  /** Cuántos elementos hay; va en amarillo, al lado del título. */
  count?: ReactNode;
  /** Acción a la derecha, normalmente un `LinkButton` chico. */
  action?: ReactNode;
  small?: boolean;
}

/**
 * `▌ TÍTULO  12                    [acción]` sobre una línea.
 *
 * Es el único encabezado de la app: un título sin su tick amarillo no existe (regla 8).
 */
export default function SectionHead({ title, count, action, small = false }: SectionHeadProps) {
  return (
    <header className="ne-section-head">
      <div className="ne-section-title">
        <span className={small ? 'ne-tick ne-tick-sm' : 'ne-tick'} aria-hidden="true" />
        <h3 className={small ? 'ne-display ne-display-sm' : 'ne-display ne-display-md'}>{title}</h3>
        {count !== undefined && <span className="ne-section-count">{count}</span>}
      </div>
      {action}
    </header>
  );
}
