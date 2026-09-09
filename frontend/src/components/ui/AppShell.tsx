import { useCallback, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { describeError } from '../../api/errors';
import { useKeyFromUrlFragment } from '../../hooks/useAccountKey';
import { useApi } from '../../hooks/useApi';
import { useCompactHeader } from '../../hooks/useCompactHeader';
import { SyncContext } from '../../lib/syncContext';
import type { SyncState } from '../../lib/syncContext';
import Banner from './Banner';
import Button from './Button';

interface Tab {
  label: string;
  to: string;
  end?: boolean;
}

interface SyncNotice {
  title: string;
  text: string;
  tone: 'info' | 'warn';
}

export default function AppShell() {
  const nested = useMatch('/account/:uid/*');
  const root = useMatch('/account/:uid');
  const uid = nested?.params.uid ?? root?.params.uid ?? '';
  const { narrow, hidden, ref } = useCompactHeader();
  useKeyFromUrlFragment(uid);
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<SyncNotice | null>(null);
  const [version, setVersion] = useState(0);

  const tabs = useMemo<Tab[]>(
    () =>
      uid
        ? [
            { label: 'Panel', to: `/account/${uid}`, end: true },
            { label: 'Roster', to: `/account/${uid}/agents` },
            { label: 'Equipos', to: `/account/${uid}/teams` },
            { label: 'Shiyu', to: `/account/${uid}/chronicle/shiyu` },
            { label: 'Asalto', to: `/account/${uid}/chronicle/assault` },
          ]
        : [],
    [uid],
  );

  const sync = useCallback(async () => {
    if (!uid || syncing) return;
    setSyncing(true);
    setNotice(null);
    try {
      await api.syncAccount(uid);
      setVersion((current) => current + 1);
    } catch (caught) {
      const paused = caught instanceof ApiError && caught.status === 429;
      setNotice({
        title: paused ? 'Sincronización en pausa' : 'No se pudo sincronizar',
        text: describeError(caught),
        tone: paused ? 'warn' : 'info',
      });
    } finally {
      setSyncing(false);
    }
  }, [uid, syncing]);

  const state = useMemo<SyncState>(
    () => ({ version, syncing, sync: () => void sync() }),
    [version, syncing, sync],
  );

  const syncButton = uid && (
    <Button tone="accent" size="sm" onClick={state.sync} disabled={syncing}>
      {syncing ? 'Sincronizando…' : 'Sincronizar'}
    </Button>
  );

  const uidPill = uid && (
    <>
      <span className="ne-label ne-label-sm">UID</span>
      <span className="ne-data-pill">{uid}</span>
    </>
  );

  return (
    <SyncContext.Provider value={state}>
      <div className="ne-scanlines" aria-hidden="true" />

      <div className="ne-shell">
        <div className={hidden ? 'ne-header is-hidden' : 'ne-header'} ref={ref}>
          <div className="ne-header-bar">
            <div className="ne-brand">
              <Link className="ne-logo" to="/">
                Z·Z·Z
              </Link>
              {!narrow && <span className="ne-brand-sub">Tracker</span>}
            </div>

            {!narrow && (
              <nav className="ne-tabs">
                {tabs.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.end}
                    className={({ isActive }) => (isActive ? 'ne-tab is-active' : 'ne-tab')}
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
            )}

            <span className="ne-header-gap" />

            {!narrow && uid && (
              <div className="ne-header-account">
                {uidPill}
                {syncButton}
              </div>
            )}

            {narrow && tabs.length > 0 && (
              <button
                type="button"
                className={menuOpen ? 'ne-burger is-open' : 'ne-burger'}
                aria-label="Menú"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span />
                <span />
                <span />
              </button>
            )}
          </div>

          {narrow && menuOpen && (
            <div className="ne-menu">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    isActive ? 'ne-tab ne-tab-menu is-active' : 'ne-tab ne-tab-menu'
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
              <div className="ne-menu-foot">
                {uidPill}
                <span className="ne-header-gap" />
                {syncButton}
              </div>
            </div>
          )}
        </div>

        {notice && (
          <Banner title={notice.title} tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}
          </Banner>
        )}

        <Outlet />

        <BackendStatus />
      </div>
    </SyncContext.Provider>
  );
}

function BackendStatus() {
  const { data, error, loading } = useApi(() => api.health());

  return (
    <footer className="ne-footer ne-label">
      {loading && 'Consultando el backend…'}
      {!loading && error && (
        <span style={{ color: 'var(--red)' }}>
          <span className="ne-footer-dot" aria-hidden="true" /> Backend offline — {error}
        </span>
      )}
      {!loading && data && (
        <span style={{ color: 'var(--green)' }}>
          <span className="ne-footer-dot" aria-hidden="true" /> {data.app} {data.version} ·{' '}
          {data.status}
        </span>
      )}
    </footer>
  );
}
