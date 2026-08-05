import { useCallback, useSyncExternalStore } from 'react';
import { msUntil } from '../lib/time';

/**
 * Milisegundos que faltan hasta `iso`, refrescados cada segundo hasta llegar a 0.
 *
 * Devuelve 0 (y no arma el intervalo) cuando la fecha ya pasó o no hay ninguna; el
 * intervalo se corta solo al vencer, así que la pantalla deja de re-renderizarse.
 */
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

/** Truncado al segundo para que el snapshot no cambie en cada render. */
function currentSecond(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}
