import type { HTMLAttributes } from 'react';

/** Los cinco atributos de ZZZ. Cada uno tiene su color fijo en los tokens. */
export type ElementName = 'fire' | 'ice' | 'electric' | 'physics' | 'ether';

const LABELS: Record<ElementName, string> = {
  fire: 'Fuego',
  ice: 'Hielo',
  electric: 'Eléctrico',
  physics: 'Físico',
  ether: 'Éter',
};

export interface ElementTagProps extends HTMLAttributes<HTMLSpanElement> {
  element: ElementName;
  /** Texto propio. Por defecto usa el nombre del atributo en español. */
  label?: string;
}

/**
 * Etiqueta de atributo elemental. El color lo decide `element`, nunca el llamador:
 * el mapeo atributo → color es parte del sistema y tiene que ser el mismo en toda la app.
 */
export function ElementTag({ element, label, className, ...rest }: ElementTagProps) {
  const classes = ['tag', `element-${element}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {label ?? LABELS[element]}
    </span>
  );
}
