import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PortraitCardProps {
  to: string;
  name: string;
  art: string | null;
  fallback: ReactNode;
  rank: string | null;
  rankColor: string;
  elementColor: string;
  elementIcon?: string | null;
  meta: ReactNode;
  score?: ReactNode;
  scoreLabel?: string;
  tags?: ReactNode;
  footNote?: ReactNode;
}

export default function PortraitCard({
  to,
  name,
  art,
  fallback,
  rank,
  rankColor,
  elementColor,
  elementIcon,
  meta,
  score,
  scoreLabel = 'Build',
  tags,
  footNote,
}: PortraitCardProps) {
  return (
    <Link className="ne-portrait-card ne-cut ne-cut-lg" to={to}>
      {rank && (
        <span
          className="ne-watermark ne-portrait-rank"
          style={{ color: rankColor }}
          aria-hidden="true"
        >
          {rank}
        </span>
      )}

      <span className="ne-band" style={{ bottom: '100px', height: '34px' }} aria-hidden="true" />
      <span
        className="ne-band"
        style={{ bottom: '85px', height: '7px', background: elementColor }}
        aria-hidden="true"
      />

      {art ? (
        <img className="ne-portrait-art" src={art} alt="" loading="lazy" />
      ) : (
        <span className="ne-portrait-fallback" aria-hidden="true">
          {fallback}
        </span>
      )}

      {score !== undefined && score !== null && (
        <span className="ne-pill ne-portrait-score">
          <span className="ne-label ne-label-sm" style={{ color: 'rgba(13,14,18,.66)' }}>
            {scoreLabel}
          </span>
          <span className="ne-value ne-value-lg" style={{ color: '#0d0e12' }}>
            {score}
          </span>
        </span>
      )}

      <div className="ne-portrait-foot">
        <div className="ne-portrait-name">
          {elementIcon && <img src={elementIcon} alt="" loading="lazy" />}
          <h4 className="ne-display ne-display-sm">{name}</h4>
        </div>
        <span className="ne-label ne-label-lg">{meta}</span>
        {tags}
        {footNote && <span className="ne-label ne-portrait-note">{footNote}</span>}
      </div>
    </Link>
  );
}
