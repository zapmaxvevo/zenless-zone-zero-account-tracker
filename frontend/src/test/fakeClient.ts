import type { api as RealApi } from '../api/client';

type Method = keyof typeof RealApi;

export interface Settled<T> {
  then<R>(ok?: (value: T) => R, bad?: (failure: unknown) => R): Settled<R>;
  catch<R>(bad: (failure: unknown) => R): Settled<T | R>;
}

let table = new Map<string, unknown>();

export function stubApi(responses: Partial<Record<Method, unknown>>): void {
  table = new Map(Object.entries(responses));
}

export const api = new Proxy(
  {},
  { get: (_target, method: string) => () => answer(method) },
) as unknown as typeof RealApi;

function answer(method: string): unknown {
  if (!table.has(method)) return pending();
  const value = table.get(method);
  return value instanceof Error ? rejected(value) : resolved(value);
}

export function resolved<T>(value: T): Settled<T> {
  return {
    then: <R,>(ok?: (value: T) => R) => (ok ? settle(() => ok(value)) : (resolved(value) as never)),
    catch: () => resolved(value),
  };
}

export function rejected<T>(failure: unknown): Settled<T> {
  return {
    then: <R,>(_ok?: (value: T) => R, bad?: (failure: unknown) => R) =>
      bad ? settle(() => bad(failure)) : (rejected<R>(failure) as Settled<R>),
    catch: <R,>(bad: (failure: unknown) => R) => settle(() => bad(failure)) as Settled<T | R>,
  };
}

export function pending<T>(): Settled<T> {
  const stuck: Settled<T> = {
    then: () => stuck as never,
    catch: () => stuck,
  };
  return stuck;
}

function settle<R>(run: () => R): Settled<R> {
  try {
    return resolved(run());
  } catch (thrown) {
    return rejected(thrown);
  }
}
