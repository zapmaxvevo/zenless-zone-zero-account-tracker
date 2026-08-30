import { useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { useApi } from './useApi';

export interface AgentArt {
  art: (gameId: number) => string | null;
  loading: boolean;
}

export function useAgentArt(): AgentArt {
  const { data, loading } = useApi(() => api.catalogAgents());

  const byGameId = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of data?.items ?? []) {
      if (entry.image_url) map.set(entry.game_id, entry.image_url);
    }
    return map;
  }, [data]);

  const art = useCallback((gameId: number) => byGameId.get(gameId) ?? null, [byGameId]);

  return { art, loading };
}
