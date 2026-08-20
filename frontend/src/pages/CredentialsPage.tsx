import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
import ChronicleNav from '../components/ChronicleNav';
import StatusMessage from '../components/StatusMessage';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import { formatDateTime } from '../lib/time';
import '../styles/chronicle.css';

/**
 * Los tres pasos del camino recomendado. La extensión todavía no está publicada: el primer
 * paso lo dice tal cual en vez de fingir un link de tienda (regla 11: la ausencia también es dato).
 */
const STEPS: { title: string; note: React.ReactNode }[] = [
  {
    title: 'Instalá la extensión',
    note: 'Todavía no está publicada en las tiendas: se carga desempaquetada desde extension/ del repo. El link de instalación va a aparecer acá.',
  },
  {
    title: 'Configurala',
    note: (
      <>
        En las opciones de la extensión pegá la URL de este tracker y el token: el valor de{' '}
        <code className="ne-connect-token">ZZZ_API_TOKEN</code> del servidor.
      </>
    ),
  },
  {
    title: 'Importá',
    note: 'Con la sesión de HoYoLAB abierta en el navegador, tocá Importar en el popup. Los datos van directo de tu navegador al tracker.',
  },
];

export default function CredentialsPage() {
  const uid = useParams().uid ?? '';
  const navigate = useNavigate();
  const account = useApi(() => api.getAccount(uid), uid);
  const [ltuid, setLtuid] = useState('');
  const [ltoken, setLtoken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const fromExtension = account.data?.chronicle_import_source === 'extension';

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

          <form className="ne-cred-form" onSubmit={(event) => void handleSubmit(event)}>
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

            {error && <StatusMessage kind="error">{error}</StatusMessage>}
            {done && <StatusMessage kind="empty">{done}</StatusMessage>}

            <div className="ne-actions">
              <button
                type="submit"
                className="zui-button zui-button-accent"
                disabled={busy || !ltuid.trim() || !ltoken.trim()}
              >
                {busy ? 'Guardando…' : 'Guardar credenciales'}
              </button>

              <button
                type="button"
                className="zui-button zui-button-danger"
                onClick={() => void handleDelete()}
                disabled={busy}
              >
                Borrar credenciales
              </button>

              <span className="ne-label">Solo se usan para sincronizar</span>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
