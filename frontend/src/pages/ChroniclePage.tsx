import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChallengeMode } from '../api/types';
import { MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE } from '../api/types';
import ChronicleNav from '../components/ChronicleNav';
import ChronicleSeason from '../components/ChronicleSeason';
import AsyncSection from '../components/ui/AsyncSection';
import Hero from '../components/ui/Hero';
import { useApi } from '../hooks/useApi';
import { groupRunsByMode } from '../lib/chronicle';
import { nameOr } from '../lib/labels';
import { useSync } from '../lib/syncContext';
import '../styles/chronicle.css';

export type ChronicleMode = 'shiyu' | 'assault';

interface ChroniclePageProps {
  mode: ChronicleMode;
}

interface Spec {
  apiMode: ChallengeMode;
  watermark: string;
  title: string;
  subtitle: string;
  current: string;
  previous: string;
  layered: boolean;
}

const SPECS: Record<ChronicleMode, Spec> = {
  shiyu: {
    apiMode: MODE_SHIYU_DEFENSE,
    watermark: 'SHIYU',
    title: 'Defensa Shiyu',
    subtitle: 'Temporada actual y anterior · intentos agrupados por capa',
    current: 'Temporada actual',
    previous: 'Temporada anterior',
    layered: true,
  },
  assault: {
    apiMode: MODE_DEADLY_ASSAULT,
    watermark: 'ASALTO',
    title: 'Asalto Mortal',
    subtitle: 'Ciclo actual y anterior · un jefe por intento',
    current: 'Ciclo actual',
    previous: 'Ciclo anterior',
    layered: false,
  },
};

export default function ChroniclePage({ mode }: ChroniclePageProps) {
  const uid = useParams().uid ?? '';
  const spec = SPECS[mode];
  const { version } = useSync();

  const account = useApi(() => api.getAccount(uid), `${uid}:${version}`);
  const runs = useApi(
    () => api.listChallenges(uid, spec.apiMode),
    `${uid}:${spec.apiMode}:${version}`,
  );
  const bangboos = useApi(() => api.listBangboos(uid), `${uid}:${version}`);
  const catalog = useApi(() => api.catalogAgents(), 'catalog');

  const seasons = useMemo(
    () => groupRunsByMode(runs.data?.items ?? [], spec.apiMode),
    [runs.data, spec.apiMode],
  );

  const agentName = useMemo(() => {
    const names = new Map(catalog.data?.items.map((agent) => [agent.game_id, agent.name]) ?? []);
    return (gameId: number) => nameOr(names.get(gameId) ?? null, 'Agente', gameId);
  }, [catalog.data]);

  const bangbooName = useMemo(() => {
    const names = new Map(bangboos.data?.items.map((boo) => [boo.game_id, boo.name]) ?? []);
    return (gameId: number | null) => (gameId === null ? null : (names.get(gameId) ?? null));
  }, [bangboos.data]);

  const empty = !runs.loading && !runs.error && seasons.length === 0;

  return (
    <div className="ne-stack">
      <ChronicleNav uid={uid} account={account.data} empty={empty} />

      <Hero size="sm" watermark={spec.watermark}>
        <span className="ne-eyebrow">HoYoLAB Chronicle // UID {uid}</span>
        <h2 className="ne-display ne-display-lg">{spec.title}</h2>
        <span className="ne-label ne-label-lg">{spec.subtitle}</span>
      </Hero>

      <AsyncSection
        state={runs}
        loading="Cargando el Chronicle…"
        isEmpty={seasons.length === 0}
        empty="No hay temporadas guardadas de este modo. HoYoLAB solo publica la actual y la anterior: sincronizá el Chronicle para traerlas."
      />

      {seasons.map((run, index) => (
        <ChronicleSeason
          key={run.id}
          run={run}
          mode={mode}
          layered={spec.layered}
          label={index === 0 ? spec.current : spec.previous}
          current={index === 0}
          agentName={agentName}
          bangbooName={bangbooName}
        />
      ))}
    </div>
  );
}
