import type { InputHTMLAttributes } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Usa la tipografía monoespaciada. Para UIDs, niveles y cualquier valor numérico. */
  mono?: boolean;
  invalid?: boolean;
}

/**
 * Campo de texto. Envolvelo siempre en `Field` para que tenga etiqueta;
 * suelto solo se justifica dentro de una barra de búsqueda.
 */
export function TextInput({ mono = false, invalid = false, className, ...rest }: TextInputProps) {
  const classes = [
    'zui-input',
    mono && 'zui-input-mono',
    invalid && 'zui-input-invalid',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <input className={classes} aria-invalid={invalid || undefined} {...rest} />;
}
