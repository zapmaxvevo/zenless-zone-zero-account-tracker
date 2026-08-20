import type { ReactNode } from 'react';

interface FaceProps {
  /** Arte de cuerpo entero: el CSS lo escala y lo recorta a la cara. */
  art: string | null;
  fallback: ReactNode;
  /** Color del aro: el del elemento del agente. */
  ring: string;
  size?: number;
  /** Cifra en la esquina, si el retrato lleva score. */
  badge?: ReactNode;
}

/** Retrato circular con aro del color del elemento: equipos, intentos de Chronicle. */
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
