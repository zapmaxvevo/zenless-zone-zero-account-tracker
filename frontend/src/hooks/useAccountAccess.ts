import { useCallback, useState } from 'react';
import { api } from '../api/client';
import { describeError, isNotFound } from '../api/errors';
import type { AccountRead, ClaimLevel } from '../api/types';
import { CLAIM_UNCLAIMED } from '../api/types';
import { useAccountKey } from './useAccountKey';
import { useApi } from './useApi';

export interface AccountAccess {
  uid: string;
  key: string | null;
  canWrite: boolean;
  claimLevel: ClaimLevel | null;
  claimable: boolean;
  claiming: boolean;
  untracked: boolean;
  resolving: boolean;
  error: string | null;
  issuedKey: string | null;
  issuedKeyStored: boolean;
  claim: () => void;
  dismissIssuedKey: () => void;
  saveKey: (value: string) => boolean;
  forget: () => void;
}

export const STORAGE_BLOCKED_MESSAGE =
  'Este navegador no dejó guardar la key. Copiala ahora y guardala vos: sin almacenamiento local el tracker no puede recordarla.';

export function useAccountAccess(uid: string, account?: AccountRead | null): AccountAccess {
  const { key, hasKey, save, forget } = useAccountKey(uid);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ key: string; stored: boolean } | null>(null);
  const [claimedLevel, setClaimedLevel] = useState<ClaimLevel | null>(null);

  const fetchesAccount = account === undefined;
  const fetched = useApi(
    () => (fetchesAccount ? api.getAccount(uid) : Promise.resolve(null)),
    `${uid}:${fetchesAccount ? 'propia' : 'prestada'}:${claimedLevel ?? ''}`,
  );

  const claimLevel = claimedLevel ?? account?.claim_level ?? fetched.data?.claim_level ?? null;
  const untracked = fetchesAccount && isNotFound(fetched.cause);

  const claim = useCallback(() => {
    void (async () => {
      setClaiming(true);
      setError(null);
      try {
        const claimed = await api.claimAccount(uid);
        setClaimedLevel(claimed.claim_level);
        if (claimed.account_key) {
          setIssued({ key: claimed.account_key, stored: save(claimed.account_key) });
        }
      } catch (caught) {
        setError(describeError(caught));
      } finally {
        setClaiming(false);
      }
    })();
  }, [uid, save]);

  const dismissIssuedKey = useCallback(() => setIssued(null), []);

  return {
    uid,
    key,
    canWrite: hasKey,
    claimLevel,
    claimable: !hasKey && claimLevel === CLAIM_UNCLAIMED,
    claiming,
    untracked,
    resolving: claimLevel === null && !untracked,
    error,
    issuedKey: issued?.key ?? null,
    issuedKeyStored: issued?.stored ?? false,
    claim,
    dismissIssuedKey,
    saveKey: save,
    forget,
  };
}
