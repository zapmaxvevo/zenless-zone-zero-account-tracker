import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import BangbooCard from '../components/BangbooCard';
import ChronicleNav from '../components/ChronicleNav';
import AsyncSection from '../components/ui/AsyncSection';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import { useSync } from '../lib/syncContext';
import '../styles/chronicle.css';

export default function BangboosPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();
  const account = useApi(() => api.getAccount(uid), `${uid}:${version}`);
  const boos = useApi(() => api.listBangboos(uid), `${uid}:${version}`);

  const bangboos = boos.data?.items ?? [];
  const empty = !boos.loading && !boos.error && bangboos.length === 0;

  return (
    <div className="ne-stack">
      <ChronicleNav uid={uid} account={account.data} empty={empty} />

      <Hero size="sm" watermark="BANGBOO">
        <span className="ne-eyebrow">HoYoLAB Chronicle // UID {uid}</span>
        <h2 className="ne-display ne-display-lg">Bangboos</h2>
        <span className="ne-label ne-label-lg">
          {bangboos.length} bangboos registrados en la cuenta
        </span>
      </Hero>

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead title="Roster de bangboos" count={bangboos.length} />

        <AsyncSection
          state={boos}
          loading="Cargando los bangboos…"
          isEmpty={bangboos.length === 0}
          empty="Esta cuenta no tiene bangboos sincronizados. Salen del Battle Chronicle: sincronizá para traerlos."
        />

        {bangboos.length > 0 && (
          <div className="ne-grid-boos">
            {bangboos.map((bangboo) => (
              <BangbooCard key={bangboo.game_id} bangboo={bangboo} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
