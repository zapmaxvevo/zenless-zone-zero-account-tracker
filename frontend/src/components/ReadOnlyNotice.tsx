import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ClaimLevel } from '../api/types';
import { CLAIM_PROVISIONAL, CLAIM_VERIFIED } from '../api/types';
import type { AccountAccess } from '../hooks/useAccountAccess';
import AccountKeyBanner from './AccountKeyBanner';
import StatusMessage from './StatusMessage';
import Banner from './ui/Banner';
import Button from './ui/Button';

interface ReadOnlyNoticeProps {
  access: AccountAccess;
  what: string;
}

export default function ReadOnlyNotice({ access, what }: ReadOnlyNoticeProps) {
  const { uid, canWrite, claimable, claiming, untracked, resolving, error, issuedKey } = access;

  return (
    <>
      {issuedKey && (
        <AccountKeyBanner
          uid={uid}
          accountKey={issuedKey}
          stored={access.issuedKeyStored}
          onDismiss={access.dismissIssuedKey}
        />
      )}

      {!canWrite && (
        <Banner title={noticeTitle(access)} tone="warn">
          {untracked ? (
            <>
              El UID {uid} no está en el tracker todavía, así que no hay build ni equipo que editar.
              Empezá a seguirlo desde <Link to="/">el registro</Link> y volvé.
            </>
          ) : resolving ? (
            <>
              Todavía estamos viendo quién es dueño del UID {uid}. Hasta que se sepa, {what} queda
              en modo lectura.
            </>
          ) : claimable ? (
            <>
              Nadie reclamó el UID {uid} todavía, así que no hay key que pueda escribirlo y {what}{' '}
              queda en modo lectura. Reclamalo y quedate con la key que te devuelve.{' '}
              <Button tone="accent" size="sm" onClick={access.claim} disabled={claiming}>
                {claiming ? 'Reclamando…' : 'Reclamar este UID'}
              </Button>
            </>
          ) : (
            <>
              Esta computadora no guarda la key del UID {uid}, así que {what} queda en modo lectura.{' '}
              {recoveryHint(uid, access.claimLevel)}
            </>
          )}
        </Banner>
      )}

      {error && <StatusMessage kind="error">{error}</StatusMessage>}
    </>
  );
}

function noticeTitle({ untracked, resolving, claimable }: AccountAccess): string {
  if (untracked) return 'Este UID no está trackeado';
  if (resolving) return 'Viendo de quién es este UID';
  if (claimable) return 'Reclamalo para editar';
  return 'Este UID tiene dueño';
}

function recoveryHint(uid: string, claimLevel: ClaimLevel | null): ReactNode {
  const paste = <Link to={`/account/${uid}/credentials`}>Conectar HoYoLAB</Link>;

  if (claimLevel === CLAIM_VERIFIED) {
    return (
      <>
        Copiala de la instalación que la tenga y pegala en {paste}. Si la perdiste del todo, la
        única salida es <code className="ne-connect-token">zzz-tracker rotate-key {uid}</code> en el
        servidor: esta cuenta ya se reclamó con un import, y volver a importar no la rota.
      </>
    );
  }

  if (claimLevel === CLAIM_PROVISIONAL) {
    return (
      <>
        Pegá la key en {paste}, o importá el Chronicle con la extensión: este UID se reclamó desde
        la web, así que un import lo verifica y te devuelve una key nueva.
      </>
    );
  }

  return <>Si la key vigente está en otra instalación, pegala en {paste}.</>;
}
