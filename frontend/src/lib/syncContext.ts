import { createContext, useContext } from 'react';

export interface SyncState {
  /** Sube en cada sincronización exitosa: las pantallas lo usan como clave de `useApi`. */
  version: number;
  syncing: boolean;
  sync: () => void;
}

const FALLBACK: SyncState = { version: 0, syncing: false, sync: () => {} };

export const SyncContext = createContext<SyncState>(FALLBACK);

/** El estado de sincronización que publica el shell. Fuera del shell no hace nada. */
export function useSync(): SyncState {
  return useContext(SyncContext);
}
