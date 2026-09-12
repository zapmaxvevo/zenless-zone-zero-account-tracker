import type { ReactNode } from 'react';

export type HeroSize = 'sm' | 'md' | 'lg';

interface HeroProps {
  children: ReactNode;
  size?: HeroSize;
  watermark?: string | null;
  beamColor?: string;
  art?: string | null;
}

export default function Hero({
  children,
  size = 'lg',
  watermark = null,
  beamColor = 'var(--accent)',
  art = null,
}: HeroProps) {
  return (
    <div className={`ne-hero ne-hero-${size} ne-cut ne-cut-xl`}>
      {watermark && (
        <span className="ne-watermark" aria-hidden="true">
          {watermark}
        </span>
      )}

      <Beams color={beamColor} />

      <div className="ne-hero-row">
        <div className="ne-hero-body">{children}</div>
        {art && (
          <div className="ne-hero-art">
            <img src={art} alt="" loading="lazy" />
          </div>
        )}
      </div>
    </div>
  );
}

function Beams({ color }: { color: string }) {
  return (
    <span aria-hidden="true">
      <span className="ne-beam ne-beam-1" style={{ background: color }} />
      <span className="ne-beam ne-beam-2" style={{ background: color }} />
      <span className="ne-beam ne-beam-3" />
    </span>
  );
}
