import type { ReactNode } from 'react';

interface BannerProps {
  title: string;
  children: ReactNode;
  tone?: 'info' | 'warn';
  onDismiss?: () => void;
}

export default function Banner({ title, children, tone = 'info', onDismiss }: BannerProps) {
  return (
    <div className={`ne-banner ne-cut ne-cut-md${tone === 'warn' ? ' ne-banner-warn' : ''}`}>
      <span className="ne-banner-dot" aria-hidden="true" />

      <div className="ne-banner-body">
        <span
          className="ne-label ne-label-lg"
          style={{ fontWeight: 700, color: tone === 'warn' ? 'var(--accent)' : 'var(--text)' }}
        >
          {title}
        </span>
        <p className="ne-prose">{children}</p>
      </div>

      {onDismiss && (
        <button type="button" className="ne-ghost" onClick={onDismiss}>
          Cerrar
        </button>
      )}
    </div>
  );
}
