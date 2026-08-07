import type { HTMLAttributes, ReactNode } from 'react';

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Etiqueta del campo. Se muestra en mayúsculas y atenuada, arriba del control. */
  label: ReactNode;
  /** `id` del control que envuelve, para asociarlo con la etiqueta. */
  htmlFor?: string;
  /** Texto de ayuda debajo del control. */
  hint?: ReactNode;
  /** Marca el `hint` en rojo. */
  invalid?: boolean;
  children?: ReactNode;
}

/**
 * Envoltorio de un control de formulario: etiqueta arriba, control, ayuda abajo.
 * Poné varios dentro de `FieldRow` para alinearlos en una fila.
 */
export function Field({
  label,
  htmlFor,
  hint,
  invalid = false,
  className,
  children,
  ...rest
}: FieldProps) {
  const classes = ['field', className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && (
        <span className={invalid ? 'field-hint field-hint-error' : 'field-hint'}>{hint}</span>
      )}
    </div>
  );
}

export interface FieldRowProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Fila de `Field` que reparte el ancho y alinea los controles por abajo. */
export function FieldRow({ className, children, ...rest }: FieldRowProps) {
  const classes = ['field-row', className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
