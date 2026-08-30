import { useCallback, useEffect, useRef, useState } from 'react';

/** Por debajo de este ancho el header colapsa a hamburguesa (regla 12 de docs/DESIGN.md). */
const NARROW_AT = 800;

/** Delta mínimo de scroll para reaccionar: evita que el header tiemble con el rebote. */
const SCROLL_DELTA = 6;

/** Antes de este scroll el header nunca se esconde. */
const SCROLL_FLOOR = 90;

export interface CompactHeader {
  narrow: boolean;
  hidden: boolean;
  /** Va en el nodo del header: mide su contenedor, no la ventana. */
  ref: (node: HTMLElement | null) => void;
}

/**
 * Estado del header pegajoso: si está angosto y si tiene que esconderse.
 *
 * Mide el ancho del contenedor con `ResizeObserver` en vez de una media query para que el
 * colapso sea correcto también si la app termina embebida en algo más angosto que la ventana.
 */
export function useCompactHeader(): CompactHeader {
  const [narrow, setNarrow] = useState(false);
  const [hidden, setHidden] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const node = nodeRef.current;
    const box = node?.parentElement ?? node;
    const container = box?.clientWidth ?? 0;
    const width = Math.min(window.innerWidth || Infinity, container || Infinity);
    if (!Number.isFinite(width) || width === 0) return;
    setNarrow(width < NARROW_AT);
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      nodeRef.current = node;
      if (!node) return;
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      observerRef.current = new ResizeObserver(measure);
      observerRef.current.observe(node);
    },
    [measure],
  );

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  useEffect(() => {
    let last = Math.max(0, window.scrollY);
    function onScroll() {
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      if (Math.abs(delta) < SCROLL_DELTA) return;
      last = y;
      setHidden(delta > 0 && y > SCROLL_FLOOR);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { narrow, hidden, ref };
}
