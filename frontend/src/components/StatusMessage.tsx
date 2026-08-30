import type { ReactNode } from 'react';

interface StatusMessageProps {
  kind: 'loading' | 'error' | 'empty';
  children: ReactNode;
  onRetry?: () => void;
}

/**
 * El aviso del diseño: rombo, explicación y, si se puede reintentar, el botón a la derecha.
 *
 * Solo `error` se pinta de rojo. Cargando y vacío van en gris: la ausencia de dato es dato,
 * no una falla (regla 11 de docs/DESIGN.md).
 */
export default function StatusMessage({ kind, children, onRetry }: StatusMessageProps) {
  const error = kind === 'error';

  return (
    <div
      className={`ne-banner ne-cut ne-cut-md ne-state${error ? ' ne-banner-error' : ''}`}
      role={error ? 'alert' : undefined}
    >
      <span className="ne-banner-dot" aria-hidden="true" />

      <div className="ne-banner-body">
        <p className="ne-prose">{children}</p>
      </div>

      {onRetry && (
        <button type="button" className="ne-ghost" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
