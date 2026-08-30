import { useCallback, useSyncExternalStore } from 'react';
import { msUntil } from '../lib/time';

export function useCountdown(iso: string | null | undefined): number {
  const subscribe = useCallback(
    (onTick: () => void) => {
      if (msUntil(iso, Date.now()) === 0) return () => {};

      const timer = setInterval(() => {
        onTick();
        if (msUntil(iso, Date.now()) === 0) clearInterval(timer);
      }, 1000);
      return () => clearInterval(timer);
    },
    [iso],
  );

  return msUntil(iso, useSyncExternalStore(subscribe, currentSecond, currentSecond));
}

function currentSecond(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}
