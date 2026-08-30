import { createContext, useContext } from 'react';

export interface SyncState {
  version: number;
  syncing: boolean;
  sync: () => void;
}

const FALLBACK: SyncState = { version: 0, syncing: false, sync: () => {} };

export const SyncContext = createContext<SyncState>(FALLBACK);

export function useSync(): SyncState {
  return useContext(SyncContext);
}
