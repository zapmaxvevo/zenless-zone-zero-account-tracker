import { useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { describeError } from '../api/errors';
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
    title: 'Apuntala a este tracker',
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

export default function AccountKeyPage() {
  const uid = useParams().uid ?? '';
  const account = useApi(() => api.getAccount(uid), uid);
  const access = useAccountAccess(uid, account.data);

  const fromExtension = account.data?.chronicle_import_source === 'extension';

  return (
    <div className="ne-stack">
      <ChronicleNav uid={uid} account={account.data} />

      <Hero size="md" watermark={'KEY'}>
        <span className="ne-eyebrow">Propiedad de la cuenta</span>
        <h2 className="ne-display ne-display-lg">Key de la cuenta</h2>
        <p className="ne-prose">
          Leer este tracker es público: cualquiera puede mirar el UID {uid}. Escribirlo —editar una
          build, armar un equipo, traer el Chronicle— pide la key de la cuenta, y la key la emite un
          solo lugar: el import de la extensión.
        </p>
      </Hero>

      <KeySection access={access} />

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead
          title="De dónde sale la key"
          action={<span className="ne-chip ne-cut ne-cut-sm is-active">Extensión</span>}
        />

        <div className="ne-connect-body">
          <p className="ne-prose">
            La extensión lee el Battle Chronicle desde tu navegador, con tu sesión viva: el servidor
            nunca ve tus cookies, el captcha de HoYoLAB se puede resolver ahí mismo y trae el roster
            completo, no solo lo exhibido. El primer import de un UID sin dueño lo reclama y te
            muestra su key.
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
              Último import ·{' '}
              {fromExtension && account.data
                ? `${formatDateTime(account.data.chronicle_synced_at)} · ${account.data.agent_count} agentes trackeados`
                : '—'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

interface KeySectionProps {
  access: AccountAccess;
}

function KeySection({ access }: KeySectionProps) {
  const [pasted, setPasted] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handlePaste(event: FormEvent) {
    event.preventDefault();
    setDone(null);

    const candidate = pasted.trim();
    if (!looksLikeKey(candidate)) {
      setError(`Una key del tracker empieza con ${KEY_PREFIX} y sigue con el token que la emitió.`);
      return;
    }

    setChecking(true);
    setError(null);
    try {
      await api.checkOwnership(access.uid, candidate);
    } catch (caught) {
      setError(describeError(caught));
      return;
    } finally {
      setChecking(false);
    }

    if (!access.saveKey(candidate)) {
      setError(STORAGE_BLOCKED_MESSAGE);
      return;
    }
    setPasted('');
    setDone('El backend aceptó la key: desde este navegador se puede escribir el UID.');
  }

  function handleForget() {
    if (
      !window.confirm('¿Olvidar la key de este UID? Sin ella el tracker queda en modo lectura.')
    ) {
      return;
    }
    access.forget();
    setDone('Key borrada de este navegador.');
    setError(null);
    setCopied(false);
  }

  function copyKey() {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard || !access.key) return;
    void clipboard.writeText(access.key).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <section className="ne-panel ne-cut ne-cut-lg">
      <SectionHead
        title="Esta computadora"
        action={<span className="ne-label">{status(access)}</span>}
      />

      <div className="ne-connect-body">
        {access.key ? (
          <>
            <p className="ne-prose">
              La key vive solo en este navegador, nunca viaja a ningún lado que no sea este tracker
              y el backend la guarda hasheada. Copiala para usar el mismo UID desde otra máquina: es
              la única forma de llevarla, porque no se puede volver a leer del servidor.
            </p>

            <div className="ne-actions">
              <code className="ne-key">{access.key}</code>
              <button type="button" className="ne-ghost" onClick={copyKey}>
                {copied ? 'Copiada' : 'Copiar'}
              </button>
              <Button tone="danger" onClick={handleForget}>
                Olvidar la key
              </Button>
            </div>
          </>
        ) : (
          <p className="ne-prose">
            Este navegador no guarda la key del UID, así que el tracker está en modo lectura. Si ya
            la tenés —te la mostró la extensión, o está en otra instalación— pegala acá. Si no,
            importá el UID con la extensión y la vas a recibir.
          </p>
        )}

        <form className="ne-cred-form" onSubmit={(event) => void handlePaste(event)}>
          <div className="field">
            <label className="ne-label" htmlFor="account-key">
              Pegar una key
            </label>
            <input
              id="account-key"
              value={pasted}
              placeholder={`${KEY_PREFIX}…`}
              autoComplete="off"
              onChange={(event) => setPasted(event.target.value)}
            />
            <span className="ne-label ne-label-sm">
              La que te mostró la extensión al importar este UID; se comprueba contra el servidor
              antes de guardarla
            </span>
          </div>

          {error && <StatusMessage kind="error">{error}</StatusMessage>}
          {done && <StatusMessage kind="empty">{done}</StatusMessage>}

          <div className="ne-actions">
            <Button type="submit" tone="accent" disabled={checking || pasted.trim() === ''}>
              {checking ? 'Comprobando…' : 'Guardar la key acá'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function status(access: AccountAccess): string {
  if (access.canWrite) return 'Puede escribir';
  if (access.untracked) return 'UID sin trackear';
  if (access.resolving) return '—';
  return access.hasOwner ? 'Modo lectura · con dueño' : 'Modo lectura · sin dueño';
}
