import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { AccountRead } from '../api/types';
import StatusMessage from '../components/StatusMessage';
import { useApi } from '../hooks/useApi';
import { useCountdown } from '../hooks/useCountdown';
import { formatCountdown, formatDateTime } from '../lib/time';

export default function AccountPage() {
  const uid = useParams().uid ?? '';
  const { data, error, loading, reload } = useApi(() => api.getAccount(uid), uid);
  const [synced, setSynced] = useState<AccountRead | null>(null);

  const account = synced?.uid === uid ? synced : data;

  return (
    <>
      <nav className="crumbs">
        <Link to="/">← Cuentas</Link>
      </nav>

      {loading && <StatusMessage kind="loading">Cargando la cuenta…</StatusMessage>}

      {!loading && error && (
        <StatusMessage kind="error" onRetry={reload}>
          {error}
        </StatusMessage>
      )}

      {account && <AccountOverview account={account} uid={uid} onSynced={setSynced} />}
    </>
  );
}

interface AccountOverviewProps {
  account: AccountRead;
  uid: string;
  onSynced: (account: AccountRead) => void;
}

function AccountOverview({ account, uid, onSynced }: AccountOverviewProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const remaining = useCountdown(account.next_sync_available_at);
  const onCooldown = remaining > 0;

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      onSynced(await api.syncAccount(uid));
    } catch (caught) {
      setSyncError(describeError(caught));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>{account.nickname || `UID ${account.uid}`}</h2>
          <p className="dim">{account.signature || 'Sin firma'}</p>
        </div>
        <button type="button" onClick={handleSync} disabled={syncing || onCooldown}>
          {syncing
            ? 'Sincronizando…'
            : onCooldown
              ? `Disponible en ${formatCountdown(remaining)}`
              : 'Sincronizar'}
        </button>
      </header>

      {syncError && <StatusMessage kind="error">{syncError}</StatusMessage>}

      <dl className="meta">
        <dt>UID</dt>
        <dd>{account.uid}</dd>
        <dt>Nivel Inter-Knot</dt>
        <dd>{account.level}</dd>
        <dt>Agentes</dt>
        <dd>{account.agent_count}</dd>
        <dt>Última sincronización</dt>
        <dd>{formatDateTime(account.last_synced_at)}</dd>
        <dt>Próxima disponible</dt>
        <dd>{onCooldown ? formatCountdown(remaining) : 'ahora'}</dd>
      </dl>

      <p className="actions">
        <Link className="link-button" to={`/account/${account.uid}/agents`}>
          Ver el roster ({account.agent_count})
        </Link>
      </p>
    </section>
  );
}
