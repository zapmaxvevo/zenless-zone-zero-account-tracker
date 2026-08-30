import type { ReactNode } from 'react';
import { RankBadge } from './RankBadge';
import type { Rank } from './RankBadge';

export interface EntityCardProps {
  /** Nombre de la entidad. Se renderiza como `h3`. */
  title: ReactNode;
  /** Línea atenuada bajo el título: nivel, mindscape, cualquier dato secundario. */
  subtitle?: ReactNode;
  /** Retrato cuadrado de 64px. Si falta, se muestra `portraitFallback`. */
  portraitUrl?: string;
  /** Texto de reemplazo cuando no hay retrato — normalmente el id del juego. */
  portraitFallback?: ReactNode;
  /** Insignia de rareza anclada a la esquina del retrato. */
  rank?: Rank;
  /** Si lo pasás, la tarjeta entera es un enlace y toma el borde acento al pasar el mouse. */
  href?: string;
  className?: string;
  /** Cuerpo de la tarjeta bajo el subtítulo: `TagList`, líneas `.dim .small`, lo que haga falta. */
  children?: ReactNode;
}

/**
 * Tarjeta de entidad: retrato a la izquierda, texto a la derecha. Es la unidad de
 * los listados de agentes, W-Engines y discos. Ponelas dentro de `EntityGrid`.
 */
export function EntityCard({
  title,
  subtitle,
  portraitUrl,
  portraitFallback,
  rank,
  href,
  className,
  children,
}: EntityCardProps) {
  const classes = ['entity-card', className].filter(Boolean).join(' ');

  const inner = (
    <>
      <div className="entity-card-portrait">
        {portraitUrl ? (
          <img src={portraitUrl} alt="" loading="lazy" />
        ) : (
          <span className="entity-card-fallback">{portraitFallback}</span>
        )}
        {rank && <RankBadge rank={rank} />}
      </div>

      <div className="entity-card-body">
        <h3 className="entity-card-title">{title}</h3>
        {subtitle && <p className="dim">{subtitle}</p>}
        {children}
      </div>
    </>
  );

  if (href) {
    return (
      <a className={classes} href={href}>
        {inner}
      </a>
    );
  }

  return <div className={classes}>{inner}</div>;
}

export interface EntityGridProps {
  className?: string;
  children?: ReactNode;
}

/** Grilla que acomoda `EntityCard` en columnas de al menos 230px. */
export function EntityGrid({ className, children }: EntityGridProps) {
  const classes = ['entity-grid', className].filter(Boolean).join(' ');

  return <div className={classes}>{children}</div>;
}
