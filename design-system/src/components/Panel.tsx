import type { HTMLAttributes, ReactNode } from 'react';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Título de la sección. Se muestra en mayúsculas y en color acento. */
  title?: ReactNode;
  /** Botones alineados a la derecha del título. */
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Contenedor de sección: la superficie sobre la que se apoya casi todo el contenido.
 * Cada pantalla se arma apilando Panels dentro de una columna de ancho máximo 1080px.
 */
export function Panel({ title, actions, className, children, ...rest }: PanelProps) {
  const classes = ['panel', className].filter(Boolean).join(' ');

  return (
    <section className={classes} {...rest}>
      {(title || actions) && (
        <div className="panel-header">
          {title ? <h3 className="panel-title">{title}</h3> : <span />}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
