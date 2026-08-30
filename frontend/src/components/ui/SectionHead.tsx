import type { ReactNode } from 'react';

interface SectionHeadProps {
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  small?: boolean;
}

export default function SectionHead({ title, count, action, small = false }: SectionHeadProps) {
  return (
    <header className="ne-section-head">
      <div className="ne-section-title">
        <span className={small ? 'ne-tick ne-tick-sm' : 'ne-tick'} aria-hidden="true" />
        <h3 className={small ? 'ne-display ne-display-sm' : 'ne-display ne-display-md'}>{title}</h3>
        {count !== undefined && <span className="ne-section-count">{count}</span>}
      </div>
      {action}
    </header>
  );
}
