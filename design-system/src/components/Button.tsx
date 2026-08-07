import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `accent` para la acción principal (amarillo New Eridu), `danger` para acciones destructivas. */
  variant?: 'default' | 'accent' | 'danger';
  /** `sm` para barras de acciones densas dentro de un Panel. */
  size?: 'sm' | 'md';
  children?: ReactNode;
}

/**
 * Botón estándar del sistema. Un solo `accent` por vista: es la acción principal.
 * Para navegación usa `LinkButton`, que comparte los mismos estilos sobre un `<a>`.
 */
export function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'zui-button',
    variant !== 'default' && `zui-button-${variant}`,
    size !== 'md' && `zui-button-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
