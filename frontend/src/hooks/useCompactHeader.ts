import { useCallback, useEffect, useRef, useState } from 'react';

const NARROW_AT = 800;

const SCROLL_DELTA = 6;

const SCROLL_FLOOR = 90;

export interface CompactHeader {
  narrow: boolean;
  hidden: boolean;
  ref: (node: HTMLElement | null) => void;
}

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
