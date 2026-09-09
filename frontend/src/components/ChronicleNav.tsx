import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../api/client';
import type { AccountRead } from '../api/types';
import { useAccountKey } from '../hooks/useAccountKey';
import type { Notice } from '../lib/notices';
import { errorNotice, reportNotice } from '../lib/notices';
import '../styles/chronicle.css';
import Banner from './ui/Banner';
import Button from './ui/Button';

interface ChronicleNavProps {
  uid: string;
  account?: AccountRead | null;
  onSynced?: () => void;
  empty?: boolean;
}

const SECTIONS: { slug: string; label: string }[] = [
  { slug: 'shiyu', label: 'Defensa Shiyu' },
  { slug: 'assault', label: 'Asalto Mortal' },
  { slug: 'void', label: 'Vacío Perdido' },
  { slug: 'bangboos', label: 'Bangboos' },
];

export default function ChronicleNav({
  uid,
  account = null,
  onSynced,
  empty = false,
}: ChronicleNavProps) {
  const { hasKey } = useAccountKey(uid);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fromExtension = account?.chronicle_import_source === 'extension';

  async function handleSync() {
    setSyncing(true);
    setNotice(null);
    try {
      const report = await api.syncChronicle(uid);
      setNotice(reportNotice(report.skipped, report.unavailable_modes));
      onSynced?.();
    } catch (caught) {
      setNotice(errorNotice(caught));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <nav className="ne-chronicle-nav">
        <span className="ne-label ne-label-sm">Chronicle //</span>

        <span className="ne-chronicle-chips">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.slug}
              to={`/account/${uid}/chronicle/${section.slug}`}
              className={({ isActive }) =>
                isActive ? 'ne-chip ne-cut ne-cut-sm is-active' : 'ne-chip ne-cut ne-cut-sm'
              }
            >
              {section.label}
            </NavLink>
          ))}
        </span>

        <span className="ne-chronicle-gap" />

        <Link className="ne-ghost" to={`/account/${uid}/credentials`}>
          Conectar HoYoLAB
        </Link>

        {fromExtension && <span className="ne-data-pill">Importá de nuevo desde la extensión</span>}

        {!fromExtension && hasKey && account?.has_hoyolab_credentials && (
          <Button tone="accent" size="sm" onClick={() => void handleSync()} disabled={syncing}>
            {syncing ? 'Sincronizando…' : 'Sincronizar Chronicle'}
          </Button>
        )}
      </nav>

      {notice && (
        <Banner title={notice.title} tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}

      {empty && (
        <Banner title="Sin datos del Chronicle" tone="warn">
          {emptyHint(uid, account)}
        </Banner>
      )}
    </>
  );
}

function emptyHint(uid: string, account: AccountRead | null): ReactNode {
  if (account?.chronicle_import_source === 'extension') {
    return 'Esta cuenta se importa con la extensión. Abrí el popup de la extensión y volvé a importar para traer esta sección.';
  }

  if (account?.has_hoyolab_credentials) {
    return 'Las cookies de HoYoLAB ya están guardadas: sincronizá el Chronicle para traer los datos.';
  }

  return (
    <>
      Esta cuenta no tiene nada sincronizado desde HoYoLAB todavía.{' '}
      <Link to={`/account/${uid}/credentials`}>Conectá HoYoLAB</Link> —con la extensión o con
      cookies— y volvé a esta pantalla.
    </>
  );
}
