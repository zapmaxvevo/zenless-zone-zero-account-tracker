import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import StatusMessage from '../components/StatusMessage';
import { useApi } from '../hooks/useApi';
import { formatDateTime } from '../lib/time';
import { normalizeUid, uidError } from '../lib/uid';

export default function HomePage() {
  const navigate = useNavigate();
  const accounts = useApi(() => api.listAccounts());
  const [uid, setUid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = uidError(uid);
    if (invalid) {
      setError(invalid);
      return;
    }

    setTracking(true);
    setError(null);
    try {
      const account = await api.trackAccount(normalizeUid(uid));
      navigate(`/account/${account.uid}`);
    } catch (caught) {
      setError(describeError(caught));
      setTracking(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Seguir una cuenta</h2>
        <p className="dim">
          Ingresá el UID de la cuenta. Los datos salen de la vitrina pública de Enka.Network, así
          que el perfil tiene que estar visible en el juego.
        </p>

        <form className="uid-form" onSubmit={handleSubmit}>
          <input
            aria-label="UID de la cuenta"
            inputMode="numeric"
            placeholder="1300000000"
            value={uid}
            onChange={(event) => {
              setUid(event.target.value);
              setError(null);
            }}
          />
          <button type="submit" disabled={tracking}>
            {tracking ? 'Importando…' : 'Importar'}
          </button>
        </form>

        {error && <StatusMessage kind="error">{error}</StatusMessage>}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Cuentas seguidas</h2>
          <button type="button" onClick={accounts.reload} disabled={accounts.loading}>
            Actualizar
          </button>
        </header>

        {accounts.loading && <StatusMessage kind="loading">Buscando cuentas…</StatusMessage>}

        {!accounts.loading && accounts.error && (
          <StatusMessage kind="error" onRetry={accounts.reload}>
            {accounts.error}
          </StatusMessage>
        )}

        {!accounts.loading && accounts.data?.items.length === 0 && (
          <StatusMessage kind="empty">Todavía no seguís ninguna cuenta.</StatusMessage>
        )}

        <ul className="account-list">
          {accounts.data?.items.map((account) => (
            <li key={account.uid}>
              <Link to={`/account/${account.uid}`}>
                <strong>{account.nickname || account.uid}</strong>
                <span className="dim small">
                  UID {account.uid} · Nv. {account.level} · {account.agent_count} agentes
                </span>
                <span className="dim small">
                  Última sincronización: {formatDateTime(account.last_synced_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
