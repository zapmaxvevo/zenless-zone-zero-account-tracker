import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { describeError } from '../api/errors';
import type { AccountRead } from '../api/types';
import { MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE } from '../api/types';
import '../styles/chronicle.css';
import Banner from './ui/Banner';

interface ChronicleNavProps {
  uid: string;
  account?: AccountRead | null;
  onSynced?: () => void;
  empty?: boolean;
}

interface Notice {
  title: string;
  text: string;
  tone: 'info' | 'warn';
}

const SECTIONS: { slug: string; label: string }[] = [
  { slug: 'shiyu', label: 'Defensa Shiyu' },
  { slug: 'assault', label: 'Asalto Mortal' },
  { slug: 'void', label: 'Vacío Perdido' },
  { slug: 'bangboos', label: 'Bangboos' },
];

const MODE_LABELS: Record<string, string> = {
  [MODE_SHIYU_DEFENSE]: 'Defensa Shiyu',
  [MODE_DEADLY_ASSAULT]: 'Asalto Mortal',
};

export default function ChronicleNav({
  uid,
  account = null,
  onSynced,
  empty = false,
}: ChronicleNavProps) {
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

        {!fromExtension && account?.has_hoyolab_credentials && (
          <button
            type="button"
            className="zui-button zui-button-accent zui-button-sm"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            {syncing ? 'Sincronizando…' : 'Sincronizar Chronicle'}
          </button>
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

function reportNotice(skipped: boolean, unavailable: string[]): Notice | null {
  if (skipped) {
    return {
      title: 'Sincronización salteada',
      text: 'Los datos ya estaban al día — HoYoLAB no devolvió cambios.',
      tone: 'warn',
    };
  }

  if (unavailable.length > 0) {
    const names = unavailable.map((mode) => MODE_LABELS[mode] ?? mode).join(' y ');
    return {
      title: 'Modos sin datos',
      text: `HoYoLAB no devolvió ${names} esta vez. El resto del Chronicle se guardó igual; probá de nuevo más tarde.`,
      tone: 'warn',
    };
  }

  return null;
}

function errorNotice(caught: unknown): Notice {
  if (!(caught instanceof ApiError)) {
    return { title: 'No se pudo sincronizar', text: describeError(caught), tone: 'info' };
  }

  if (caught.detail.toLowerCase().includes('captcha')) {
    return {
      title: 'HoYoLAB pidió un captcha',
      text: 'No es un error: HoYoLAB pide una verificación que el tracker no puede resolver. La cuenta queda en pausa unos minutos; volvé a sincronizar más tarde.',
      tone: 'warn',
    };
  }

  if (caught.status === 429) {
    return {
      title: 'HoYoLAB está frenando las consultas',
      text: 'No es un error: la cuenta queda en pausa unos minutos y después se puede sincronizar de nuevo.',
      tone: 'warn',
    };
  }

  if (caught.status === 401) {
    return {
      title: 'Credenciales de HoYoLAB',
      text: 'HoYoLAB no aceptó las cookies guardadas (o no hay ninguna). Cargalas de nuevo desde la pantalla de conexión.',
      tone: 'info',
    };
  }

  if (caught.status === 403) {
    return {
      title: 'Chronicle privado',
      text: 'Esa cuenta tiene el Battle Chronicle en privado. Hay que hacerlo público desde HoYoLAB para poder leerlo.',
      tone: 'info',
    };
  }

  return { title: 'No se pudo sincronizar', text: caught.detail, tone: 'info' };
}
