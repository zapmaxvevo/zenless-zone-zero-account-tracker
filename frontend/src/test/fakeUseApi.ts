import { describeError } from '../api/errors';
import type { UseApiResult } from '../hooks/useApi';
import type { Settled } from './fakeClient';

export function useApi<T>(fetcher: () => Promise<T>): UseApiResult<T> {
  const answer = fetcher();
  if (answer instanceof Promise) return waiting();

  let data: T | null = null;
  let error: string | null = null;
  let cause: unknown = null;
  let done = false;

  (answer as unknown as Settled<T>).then(
    (value) => {
      data = value;
      done = true;
    },
    (failure) => {
      error = describeError(failure);
      cause = failure;
      done = true;
    },
  );

  return { data, error, cause, loading: !done, reload: () => {} };
}

function waiting<T>(): UseApiResult<T> {
  return { data: null, error: null, cause: null, loading: true, reload: () => {} };
}
