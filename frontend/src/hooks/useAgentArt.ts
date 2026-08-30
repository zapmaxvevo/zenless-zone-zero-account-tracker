import { useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { useApi } from './useApi';

export interface AgentArt {
  /** Arte de cuerpo entero por id del juego, o null si el catálogo no lo tiene. */
  art: (gameId: number) => string | null;
  loading: boolean;
}

/**
 * El arte grande de cada agente, sacado del catálogo.
 *
 * El roster que devuelve la API trae solo `icon_url` —el retrato circular—, y las cards de
 * la piel New Eridu necesitan el recorte de cuerpo entero. El catálogo sí lo publica en
 * `image_url`, así que se pide una vez y se cruza por `game_id`.
 */
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
