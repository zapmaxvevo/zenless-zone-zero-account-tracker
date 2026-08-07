import type { ReactNode } from 'react';
import { Button } from './Button';

export interface StatusMessageProps {
  /** `error` además anuncia el mensaje con `role="alert"`. */
  kind: 'loading' | 'error' | 'empty';
  children: ReactNode;
  /** Si lo pasás, aparece un botón de reintento alineado a la derecha. */
  onRetry?: () => void;
  /** Texto del botón de reintento. */
  retryLabel?: string;
}

/**
 * Estado de una sección que todavía no tiene contenido que mostrar: cargando,
 * error o vacío. Va dentro del `Panel` que reemplaza, no encima de él.
 */
export function StatusMessage({
  kind,
  children,
  onRetry,
  retryLabel = 'Reintentar',
}: StatusMessageProps) {
  return (
    <p className={`state state-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <span>{children}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </p>
  );
}
