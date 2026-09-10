import { api } from '../api/client';
import { isNotFound } from '../api/errors';
import type { AccountRead } from '../api/types';
import { useAccountKey } from './useAccountKey';
import { useApi } from './useApi';

export interface AccountAccess {
  uid: string;
  key: string | null;
  canWrite: boolean;
  hasOwner: boolean | null;
  untracked: boolean;
  resolving: boolean;
  saveKey: (value: string) => boolean;
  forget: () => void;
}

export const STORAGE_BLOCKED_MESSAGE =
  'Este navegador no dejó guardar la key. Copiala ahora y guardala vos: sin almacenamiento local el tracker no puede recordarla.';

export function useAccountAccess(uid: string, account?: AccountRead | null): AccountAccess {
  const { key, hasKey, save, forget } = useAccountKey(uid);

  const fetchesAccount = account === undefined;
  const fetched = useApi(
    () => (fetchesAccount ? api.getAccount(uid) : Promise.resolve(null)),
    `${uid}:${fetchesAccount ? 'propia' : 'prestada'}`,
  );

  const hasOwner = account?.has_owner ?? fetched.data?.has_owner ?? null;
  const untracked = fetchesAccount && isNotFound(fetched.cause);

  return {
    uid,
    key,
    canWrite: hasKey,
    hasOwner,
    untracked,
    resolving: hasOwner === null && !untracked,
    saveKey: save,
    forget,
  };
}
