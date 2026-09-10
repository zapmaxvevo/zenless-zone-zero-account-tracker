import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { consumeKeyFromUrl, forgetKey, readKey, saveKey, subscribe } from '../lib/accountKey';

export interface AccountKeyState {
  key: string | null;
  hasKey: boolean;
  save: (value: string) => boolean;
  forget: () => void;
}

export function useAccountKey(uid: string): AccountKeyState {
  const readCurrent = useCallback(() => readKey(uid), [uid]);
  const key = useSyncExternalStore(subscribe, readCurrent, readCurrent);

  const save = useCallback((value: string) => saveKey(uid, value), [uid]);
  const forget = useCallback(() => forgetKey(uid), [uid]);

  return { key, hasKey: key !== null, save, forget };
}

export function useKeyFromUrlFragment(uid: string): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    consumeKeyFromUrl(uid, window.location, (next) =>
      window.history.replaceState(window.history.state, '', next),
    );
  }, [uid]);
}
