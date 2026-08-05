import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../api/errors';

export interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  /** Petición a la que corresponde este resultado; si no es la actual, seguimos cargando. */
  requestId: string;
  data: T | null;
  error: string | null;
}

/**
 * Ejecuta `fetcher` al montar y expone `{data, error, loading, reload}`.
 *
 * El fetcher se lee desde una ref, así que puede ser una arrow inline sin memoizar.
 * `key` identifica la petición (p. ej. el UID consultado): al cambiar, se vuelve a pedir.
 */
export function useApi<T>(fetcher: () => Promise<T>, key: string = ''): UseApiResult<T> {
  const [reloadToken, setReloadToken] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const fetcherRef = useRef(fetcher);
  const requestId = `${reloadToken}:${key}`;

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setSettled({ requestId, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ requestId, data: null, error: describeError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const current = settled?.requestId === requestId ? settled : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    reload,
  };
}
