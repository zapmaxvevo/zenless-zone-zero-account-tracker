import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { AccountRead } from '../api/types';
import '../styles/chronicle.css';
import Banner from './ui/Banner';

interface ChronicleNavProps {
  uid: string;
  account?: AccountRead | null;
  empty?: boolean;
}

const SECTIONS: { slug: string; label: string }[] = [
  { slug: 'shiyu', label: 'Defensa Shiyu' },
  { slug: 'assault', label: 'Asalto Mortal' },
  { slug: 'void', label: 'Vacío Perdido' },
  { slug: 'bangboos', label: 'Bangboos' },
];

export default function ChronicleNav({ uid, account = null, empty = false }: ChronicleNavProps) {
  const fromExtension = account?.chronicle_import_source === 'extension';

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

        <Link className="ne-ghost" to={`/account/${uid}/key`}>
          Key de la cuenta
        </Link>

        {fromExtension && <span className="ne-data-pill">Importá de nuevo desde la extensión</span>}
      </nav>

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

  return (
    <>
      Esta cuenta no tiene nada sincronizado desde HoYoLAB todavía. El Chronicle entra solo por la
      extensión, con tu propia sesión: mirá cómo en{' '}
      <Link to={`/account/${uid}/key`}>Key de la cuenta</Link> y volvé a esta pantalla.
    </>
  );
}
