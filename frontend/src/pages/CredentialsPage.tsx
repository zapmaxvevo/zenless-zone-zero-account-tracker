import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import type { ClaimLevel, CredentialStatusRead } from '../api/types';
import AccountKeyBanner from '../components/AccountKeyBanner';
import ChronicleNav from '../components/ChronicleNav';
import StatusMessage from '../components/StatusMessage';
import Button from '../components/ui/Button';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { STORAGE_BLOCKED_MESSAGE, useAccountAccess } from '../hooks/useAccountAccess';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { useApi } from '../hooks/useApi';
import { KEY_PREFIX, looksLikeKey } from '../lib/accountKey';
import { formatDateTime } from '../lib/time';
import '../styles/chronicle.css';

const STEPS: { title: string; note: React.ReactNode }[] = [
  {
    title: 'Instalá la extensión',
    note: 'Todavía no está publicada en las tiendas: se carga desempaquetada desde extension/ del repo. El link de instalación va a aparecer acá.',
  },
  {
    title: 'Configurala',
    note: (
      <>
        En las opciones de la extensión pegá la URL de este tracker. El{' '}
        <code className="ne-connect-token">ZZZ_API_TOKEN</code> es opcional: solo hace falta si el
        servidor lo tiene seteado como reja extra.
      </>
    ),
  },
  {
    title: 'Importá',
    note: 'Con la sesión de HoYoLAB abierta en el navegador, tocá Importar en el popup. Los datos van directo de tu navegador al tracker, y el import que reclama el UID te devuelve la key que lo escribe.',
  },
];

const CLAIM_LABELS: Record<ClaimLevel, string> = {
  unclaimed: 'Sin dueño',
  provisional: 'Reclamada desde la web',
  verified: 'Verificada por un import',
};

export default function CredentialsPage() {
  const uid = useParams().uid ?? '';
  const navigate = useNavigate();
  const account = useApi(() => api.getAccount(uid), uid);
  const access = useAccountAccess(uid, account.data);
  const [credentialsToken, setCredentialsToken] = useState(0);
  const credentials = useApi(() => api.getCredentialsStatus(uid), `${uid}:${credentialsToken}`);
  const [ltuid, setLtuid] = useState('');
  const [ltoken, setLtoken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const fromExtension = account.data?.chronicle_import_source === 'extension';
  const stored = credentials.data?.stored ?? false;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.storeCredentials(uid, { ltuid_v2: ltuid.trim(), ltoken_v2: ltoken.trim() });
      navigate(`/account/${uid}/chronicle/shiyu`);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('¿Borrar las credenciales de HoYoLAB? El Chronicle deja de sincronizar.')) {
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.deleteCredentials(uid);
      setLtuid('');
      setLtoken('');
      setDone('Credenciales borradas. El Chronicle guardado sigue estando; solo no se actualiza.');
      setCredentialsToken((token) => token + 1);
      account.reload();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ne-stack">
      <ChronicleNav uid={uid} account={account.data} />

      <Hero size="md" watermark={'HOYO\nLAB'}>
        <span className="ne-eyebrow">HoYoLAB Chronicle</span>
        <h2 className="ne-display ne-display-lg">Conectar HoYoLAB</h2>
        <p className="ne-prose">
          El Chronicle lee Defensa Shiyu, Asalto Mortal, Vacío Perdido y tus bangboos directo de tu
          cuenta de HoYoLAB. Hay dos caminos: la extensión del navegador, que importa con tu propia
          sesión, o pegar las cookies para que el servidor sincronice solo.
        </p>
      </Hero>

      <AccountKeySection uid={uid} access={access} />

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead
          title="Extensión del navegador"
          action={<span className="ne-chip ne-cut ne-cut-sm is-active">Recomendado</span>}
        />

        <div className="ne-connect-body">
          <p className="ne-prose">
            La extensión lee el Battle Chronicle desde tu navegador, con tu sesión viva: el servidor
            nunca ve tus cookies, el captcha de HoYoLAB se puede resolver ahí mismo y trae el roster
            completo, no solo lo exhibido.
          </p>

          <div className="ne-grid-tiles">
            {STEPS.map((step, index) => (
              <div key={step.title} className="ne-tile ne-cut ne-cut-md">
                <span className="ne-label ne-label-sm">Paso 0{index + 1}</span>
                <span className="ne-value ne-value-lg">{step.title}</span>
                <span className="ne-prose">{step.note}</span>
              </div>
            ))}
          </div>

          <div className="ne-actions">
            <span className="ne-data-pill">
              Último import desde la extensión ·{' '}
              {fromExtension && account.data
                ? `${formatDateTime(account.data.chronicle_synced_at)} · ${account.data.agent_count} agentes trackeados`
                : '—'}
            </span>
          </div>
        </div>
      </section>

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead
          title="Cookies de HoYoLAB"
          action={<span className="ne-label">Alternativa manual</span>}
        />

        <div className="ne-connect-body">
          <p className="ne-prose">
            El camino de siempre: pegás las cookies y el servidor sincroniza solo. Se guardan
            cifradas, pero el <code className="ne-connect-token">ltoken_v2</code> caduca y un
            captcha de HoYoLAB deja el sync en pausa hasta que pase.
          </p>

          <div className="ne-actions">
            <span className="ne-data-pill">{credentialsSummary(credentials.data)}</span>
          </div>

          {credentials.error && <StatusMessage kind="error">{credentials.error}</StatusMessage>}

          <form className="ne-cred-form" onSubmit={(event) => void handleSubmit(event)}>
            <fieldset className="ne-lock" disabled={!access.canWrite}>
              <div className="field">
                <label className="ne-label" htmlFor="cred-ltuid">
                  LTUID
                </label>
                <input
                  id="cred-ltuid"
                  value={ltuid}
                  placeholder="1300047621"
                  autoComplete="off"
                  onChange={(event) => setLtuid(event.target.value)}
                />
                <span className="ne-label ne-label-sm">El id numérico de tu cuenta</span>
              </div>

              <div className="field">
                <label className="ne-label" htmlFor="cred-ltoken">
                  LTOKEN
                </label>
                <input
                  id="cred-ltoken"
                  value={ltoken}
                  placeholder="v2_CAISDGM5…"
                  autoComplete="off"
                  onChange={(event) => setLtoken(event.target.value)}
                />
                <span className="ne-label ne-label-sm">La cookie `ltoken_v2` de HoYoLAB</span>
              </div>
            </fieldset>

            {error && <StatusMessage kind="error">{error}</StatusMessage>}
            {done && <StatusMessage kind="empty">{done}</StatusMessage>}

            <div className="ne-actions">
              {access.canWrite ? (
                <>
                  <Button
                    type="submit"
                    tone="accent"
                    disabled={busy || !ltuid.trim() || !ltoken.trim()}
                  >
                    {busy ? 'Guardando…' : 'Guardar credenciales'}
                  </Button>

                  <Button
                    tone="danger"
                    onClick={() => void handleDelete()}
                    disabled={busy || !stored}
                  >
                    Borrar credenciales
                  </Button>

                  <span className="ne-label">Solo se usan para sincronizar</span>
                </>
              ) : (
                <span className="ne-label">
                  Guardar cookies pide la key de este UID: cargala más arriba
                </span>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function credentialsSummary(status: CredentialStatusRead | null): string {
  if (!status) return 'Cookies guardadas · —';
  if (!status.stored) return 'Sin cookies guardadas en el servidor';
  if (status.rejected) return 'HoYoLAB rechazó las cookies guardadas: hay que cargarlas de nuevo';
  return `Cookies guardadas · último uso ${formatDateTime(status.last_used_at)}`;
}

interface AccountKeySectionProps {
  uid: string;
  access: AccountAccess;
}

function AccountKeySection({ uid, access }: AccountKeySectionProps) {
  const [pasted, setPasted] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyDone, setKeyDone] = useState<string | null>(null);

  function handlePaste(event: FormEvent) {
    event.preventDefault();
    setKeyDone(null);
    if (!looksLikeKey(pasted)) {
      setKeyError(
        `Una key del tracker empieza con ${KEY_PREFIX} y sigue con el token que la sigue.`,
      );
      return;
    }
    if (!access.saveKey(pasted)) {
      setKeyError(STORAGE_BLOCKED_MESSAGE);
      return;
    }
    setKeyError(null);
    setPasted('');
    setKeyDone('Key guardada en este navegador: desde acá se puede escribir este UID.');
  }

  function handleForget() {
    if (
      !window.confirm('¿Olvidar la key de este UID? Sin ella el tracker queda en modo lectura.')
    ) {
      return;
    }
    access.forget();
    setKeyDone('Key borrada de este navegador.');
    setKeyError(null);
  }

  return (
    <section className="ne-panel ne-cut ne-cut-lg">
      <SectionHead
        title="Key de la cuenta"
        action={
          <span className="ne-label">
            {access.claimLevel ? CLAIM_LABELS[access.claimLevel] : '—'}
          </span>
        }
      />

      <div className="ne-connect-body">
        <p className="ne-prose">
          Leer el tracker es público; escribirlo pide la key de este UID. Se muestra una sola vez
          —cuando alguien reclama el UID, o cuando la extensión importa el Chronicle— y vive
          únicamente en el navegador que la recibió. Si venís de otra máquina, pegala acá.
        </p>

        {access.issuedKey && (
          <AccountKeyBanner
            uid={uid}
            accountKey={access.issuedKey}
            stored={access.issuedKeyStored}
            onDismiss={access.dismissIssuedKey}
          />
        )}

        <div className="ne-actions">
          <span className="ne-data-pill">
            {access.canWrite
              ? 'Esta computadora puede escribir este UID'
              : 'Esta computadora está en modo lectura'}
          </span>

          {access.claimable && (
            <Button tone="accent" onClick={access.claim} disabled={access.claiming}>
              {access.claiming ? 'Reclamando…' : 'Reclamar este UID'}
            </Button>
          )}

          {access.canWrite && (
            <Button tone="danger" onClick={handleForget}>
              Olvidar la key
            </Button>
          )}
        </div>

        {access.error && <StatusMessage kind="error">{access.error}</StatusMessage>}

        <form className="ne-cred-form" onSubmit={handlePaste}>
          <div className="field">
            <label className="ne-label" htmlFor="account-key">
              Key de la cuenta
            </label>
            <input
              id="account-key"
              value={pasted}
              placeholder={`${KEY_PREFIX}…`}
              autoComplete="off"
              onChange={(event) => setPasted(event.target.value)}
            />
            <span className="ne-label ne-label-sm">
              La que devolvió el tracker al reclamar el UID, o la extensión al importar
            </span>
          </div>

          {keyError && <StatusMessage kind="error">{keyError}</StatusMessage>}
          {keyDone && <StatusMessage kind="empty">{keyDone}</StatusMessage>}

          <div className="ne-actions">
            <Button type="submit" tone="accent" disabled={pasted.trim() === ''}>
              Guardar la key acá
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
