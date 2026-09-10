import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { BangbooRead } from '../api/types';
import ChronicleNav from '../components/ChronicleNav';
import StatusMessage from '../components/StatusMessage';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import { bangbooRankLabel } from '../lib/chronicle';
import { initials, rarityColor } from '../lib/palette';
import { useSync } from '../lib/syncContext';
import '../styles/chronicle.css';

const STAR_SLOTS = [0, 1, 2, 3, 4];

export default function BangboosPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();
  const account = useApi(() => api.getAccount(uid), `${uid}:${version}`);
  const { data, error, loading, reload } = useApi(() => api.listBangboos(uid), `${uid}:${version}`);

  const bangboos = data?.items ?? [];
  const empty = !loading && !error && bangboos.length === 0;

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

        {loading && <StatusMessage kind="loading">Cargando los bangboos…</StatusMessage>}

        {!loading && error && (
          <StatusMessage kind="error" onRetry={reload}>
            {error}
          </StatusMessage>
        )}

        {empty && (
          <StatusMessage kind="empty">
            Esta cuenta no tiene bangboos sincronizados. Salen del Battle Chronicle: sincronizá para
            traerlos.
          </StatusMessage>
        )}

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

function BangbooCard({ bangboo }: { bangboo: BangbooRead }) {
  const rank = bangbooRankLabel(bangboo.rarity);

  return (
    <article className="ne-boo ne-cut ne-cut-md">
      <div className="ne-boo-art">
        {bangboo.icon ? (
          <img src={bangboo.icon} alt="" loading="lazy" />
        ) : (
          <span className="ne-boo-fallback">{initials(bangboo.name)}</span>
        )}
        {rank && (
          <span
            className="ne-boo-badge"
            style={{ ['--rank' as string]: rarityColor(bangboo.rarity) }}
          >
            {rank}
          </span>
        )}
      </div>

      <span className="ne-value ne-value-lg">{bangboo.name}</span>

      <div className="ne-boo-foot">
        <span className="ne-label ne-label-sm">Nv. {bangboo.level}</span>
        <span className="ne-stars" aria-label={`${bangboo.star} de 5 estrellas`}>
          {STAR_SLOTS.map((slot) => (
            <span
              key={slot}
              className={slot < bangboo.star ? 'ne-star is-on' : 'ne-star'}
              aria-hidden="true"
            >
              ★
            </span>
          ))}
        </span>
      </div>
    </article>
  );
}
