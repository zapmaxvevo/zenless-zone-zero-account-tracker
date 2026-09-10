import { Link } from 'react-router-dom';
import type { AccountAccess } from '../hooks/useAccountAccess';
import Banner from './ui/Banner';

interface ReadOnlyNoticeProps {
  access: AccountAccess;
  what: string;
}

export default function ReadOnlyNotice({ access, what }: ReadOnlyNoticeProps) {
  const { uid, canWrite, hasOwner, untracked, resolving } = access;

  if (canWrite) return null;

  return (
    <Banner title={noticeTitle(access)} tone="warn">
      {untracked ? (
        <>
          El UID {uid} no está en el tracker todavía, así que no hay build ni equipo que editar.
          Empezá a seguirlo desde <Link to="/">el registro</Link> y volvé.
        </>
      ) : resolving ? (
        <>
          Todavía estamos viendo quién es dueño del UID {uid}. Hasta que se sepa, {what} queda en
          modo lectura.
        </>
      ) : hasOwner ? (
        <>
          Esta computadora no guarda la key del UID {uid}, así que {what} queda en modo lectura.
          Copiala de la instalación que la tenga y pegala en{' '}
          <Link to={`/account/${uid}/key`}>Key de la cuenta</Link>. Si la perdiste del todo, la
          única salida es <code className="ne-connect-token">zzz-tracker rotate-key {uid}</code> en
          el servidor.
        </>
      ) : (
        <>
          Nadie reclamó el UID {uid} todavía, así que no hay key que pueda escribirlo y {what} queda
          en modo lectura. Importalo con la extensión: el import lo reclama y te devuelve su key.
          Cómo, en <Link to={`/account/${uid}/key`}>Key de la cuenta</Link>.
        </>
      )}
    </Banner>
  );
}

function noticeTitle({ untracked, resolving, hasOwner }: AccountAccess): string {
  if (untracked) return 'Este UID no está trackeado';
  if (resolving) return 'Viendo de quién es este UID';
  return hasOwner ? 'Este UID tiene dueño' : 'Nadie reclamó este UID';
}
