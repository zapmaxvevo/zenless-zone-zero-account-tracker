import type { ReactNode } from 'react';

interface FaceProps {
  art: string | null;
  fallback: ReactNode;
  ring: string;
  size?: number;
  badge?: ReactNode;
}

export default function Face({ art, fallback, ring, size = 76, badge }: FaceProps) {
  return (
    <div className="ne-face-wrap" style={{ width: size, height: size }}>
      <div
        className="ne-face"
        style={{ width: '100%', height: '100%', ['--ring' as string]: ring }}
      >
        {art ? (
          <img src={art} alt="" loading="lazy" />
        ) : (
          <span className="ne-face-fallback">{fallback}</span>
        )}
      </div>
      {badge !== undefined && badge !== null && <span className="ne-face-badge">{badge}</span>}
    </div>
  );
}
