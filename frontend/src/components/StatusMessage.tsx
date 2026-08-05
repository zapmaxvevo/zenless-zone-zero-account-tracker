import type { ReactNode } from 'react';

interface StatusMessageProps {
  kind: 'loading' | 'error' | 'empty';
  children: ReactNode;
  onRetry?: () => void;
}

export default function StatusMessage({ kind, children, onRetry }: StatusMessageProps) {
  return (
    <p className={`state state-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <span>{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </p>
  );
}
