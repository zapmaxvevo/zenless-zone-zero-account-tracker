import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../api/errors';

export interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  requestId: string;
  data: T | null;
  error: string | null;
}

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
