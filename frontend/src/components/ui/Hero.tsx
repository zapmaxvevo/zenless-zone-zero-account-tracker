import type { CSSProperties, ReactNode } from 'react';

export type HeroSize = 'sm' | 'md' | 'lg';

interface HeroProps {
  children: ReactNode;
  size?: HeroSize;
  watermark?: string | null;
  beamColor?: string;
  art?: string | null;
}

const SIZES: Record<HeroSize, { minHeight: string; wmSize: string; wmBottom: string }> = {
  sm: { minHeight: '116px', wmSize: '98px', wmBottom: '-26px' },
  md: { minHeight: 'clamp(240px, 36vw, 300px)', wmSize: '132px', wmBottom: '-32px' },
  lg: { minHeight: 'clamp(280px, 42vw, 326px)', wmSize: '150px', wmBottom: '-40px' },
};

export default function Hero({
  children,
  size = 'lg',
  watermark = null,
  beamColor = 'var(--accent)',
  art = null,
}: HeroProps) {
  const spec = SIZES[size];
  const wmStyle: CSSProperties = {
    left: '-14px',
    bottom: spec.wmBottom,
    fontSize: spec.wmSize,
    opacity: size === 'sm' ? 0.09 : 0.045,
  };

  return (
    <div className="ne-hero ne-cut ne-cut-xl" style={{ minHeight: spec.minHeight }}>
      {watermark && (
        <span className="ne-watermark" style={wmStyle} aria-hidden="true">
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
      <span
        className="ne-beam"
        style={{ right: '-8%', width: 'clamp(56px, 13vw, 150px)', background: color, opacity: 0.9 }}
      />
      <span
        className="ne-beam"
        style={{ right: '12%', width: 'clamp(12px, 3vw, 34px)', background: color, opacity: 0.55 }}
      />
      <span
        className="ne-beam"
        style={{ right: '-4%', width: 'clamp(4px, 1vw, 10px)', background: 'var(--bg)' }}
      />
    </span>
  );
}
