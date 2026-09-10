import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import StatusMessage from '../components/StatusMessage';
import AsyncSection from '../components/ui/AsyncSection';
import Button from '../components/ui/Button';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import { formatDateTime } from '../lib/time';
import { normalizeUid, uidError } from '../lib/uid';

export default function HomePage() {
  const navigate = useNavigate();
  const accounts = useApi(() => api.listAccounts());
  const [uid, setUid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  const items = accounts.data?.items ?? [];

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
    <div className="ne-stack">
      <Hero size="sm" watermark="REGISTRO">
        <span className="ne-eyebrow">Inter-Knot // Registro</span>
        <h2 className="ne-display ne-display-lg">Seguir una cuenta</h2>

        <p className="ne-prose">
          Ingresá el UID de la cuenta. Los datos salen de la vitrina pública de Enka.Network, así
          que el perfil tiene que estar visible en el juego.
        </p>

        <div>
          <label className="ne-label ne-label-lg" htmlFor="uid">
            UID de la cuenta
          </label>
          <form className="uid-form" onSubmit={handleSubmit}>
            <input
              id="uid"
              inputMode="numeric"
              placeholder="1300000000"
              value={uid}
              onChange={(event) => {
                setUid(event.target.value);
                setError(null);
              }}
            />
            <Button type="submit" tone="accent" disabled={tracking}>
              {tracking ? 'Importando…' : 'Importar'}
            </Button>
          </form>
        </div>

        {error && <StatusMessage kind="error">{error}</StatusMessage>}
      </Hero>

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead
          title="Cuentas seguidas"
          count={items.length}
          action={
            <Button size="sm" onClick={accounts.reload} disabled={accounts.loading}>
              Actualizar
            </Button>
          }
        />

        <AsyncSection
          state={accounts}
          loading="Buscando cuentas…"
          isEmpty={items.length === 0}
          empty="Todavía no seguís ninguna cuenta. Pegá un UID acá arriba para empezar a trackearla."
        />

        <div className="ne-stack">
          {items.map((account) => (
            <Link
              key={account.uid}
              className="ne-row ne-row-link ne-cut ne-cut-md"
              to={`/account/${account.uid}`}
            >
              <span className="ne-row-body">
                <span className="ne-row-main">
                  <span className="ne-display ne-display-sm">
                    {account.nickname || `UID ${account.uid}`}
                  </span>
                  <span className="ne-label">
                    Nivel {account.level} · {account.agent_count} agentes · Última sincronización:{' '}
                    {formatDateTime(account.last_synced_at)}
                  </span>
                </span>
                <span className="ne-data-pill">{account.uid}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
