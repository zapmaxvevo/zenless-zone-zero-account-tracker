import type { ReactNode, SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children?: ReactNode;
}

/**
 * Desplegable nativo con los estilos del sistema. Envolvelo en `Field`.
 * Las opciones van como `<option>` hijos, sin componente intermedio.
 */
export function Select({ invalid = false, className, children, ...rest }: SelectProps) {
  const classes = ['zui-input', invalid && 'zui-input-invalid', className]
    .filter(Boolean)
    .join(' ');

  return (
    <select className={classes} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}
