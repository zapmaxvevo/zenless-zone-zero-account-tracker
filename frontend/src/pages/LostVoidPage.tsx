import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { isNotFound } from '../api/errors';
import ChronicleNav from '../components/ChronicleNav';
import LostVoidProgress from '../components/LostVoidProgress';
import AsyncSection from '../components/ui/AsyncSection';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import { useSync } from '../lib/syncContext';
import '../styles/chronicle.css';

export default function LostVoidPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();

  const account = useApi(() => api.getAccount(uid), `${uid}:${version}`);
  const run = useApi(
    () =>
      api.getLostVoid(uid).catch((caught: unknown) => {
        if (isNotFound(caught)) return null;
        throw caught;
      }),
    `${uid}:${version}`,
  );

  const missing = !run.loading && !run.error && run.data === null;

  return (
    <div className="ne-stack">
      <ChronicleNav uid={uid} account={account.data} empty={missing} />

      <Hero size="sm" watermark="VACÍO">
        <span className="ne-eyebrow">HoYoLAB Chronicle // UID {uid}</span>
        <h2 className="ne-display ne-display-lg">Vacío Perdido</h2>
        <span className="ne-label ne-label-lg">Progreso acumulado · sin temporadas</span>
      </Hero>

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead title="Progreso acumulado" />

        <AsyncSection
          state={run}
          loading="Cargando el Vacío Perdido…"
          isEmpty={run.data === null}
          empty="Esta cuenta nunca sincronizó el Vacío Perdido. Es un acumulado, no una temporada: apenas haya una sincronización con datos, queda guardado y ya no se pierde."
        />

        {run.data && <LostVoidProgress data={run.data} />}
      </section>
    </div>
  );
}
