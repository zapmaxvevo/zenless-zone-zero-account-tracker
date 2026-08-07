import type { AnchorHTMLAttributes, ReactNode } from 'react';

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Mismos tonos que `Button`, para que navegación y acción se vean iguales. */
  variant?: 'default' | 'accent' | 'danger';
  size?: 'sm' | 'md';
  children?: ReactNode;
}

/**
 * Ancla con la apariencia de `Button`. Usalo cuando la acción navega a otra pantalla,
 * así el marcado sigue siendo un enlace real y el teclado y el menú contextual funcionan.
 */
export function LinkButton({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...rest
}: LinkButtonProps) {
  const classes = [
    'zui-button',
    variant !== 'default' && `zui-button-${variant}`,
    size !== 'md' && `zui-button-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a className={classes} {...rest}>
      {children}
    </a>
  );
}
