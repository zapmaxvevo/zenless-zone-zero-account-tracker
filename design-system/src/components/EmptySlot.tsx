import type { HTMLAttributes, ReactNode } from 'react';

export interface EmptySlotProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/**
 * Hueco con borde punteado para una posición sin llenar: un slot de equipo vacío,
 * un disco que falta. Mantiene la forma de la grilla en vez de dejar un vacío.
 */
export function EmptySlot({ className, children, ...rest }: EmptySlotProps) {
  const classes = ['empty-slot', className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
