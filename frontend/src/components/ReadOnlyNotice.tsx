import { Link } from 'react-router-dom';
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
  const { uid, canWrite, claimable, claiming, error, issuedKey } = access;

  return (
    <>
      {issuedKey && (
        <AccountKeyBanner uid={uid} accountKey={issuedKey} onDismiss={access.dismissIssuedKey} />
      )}

      {!canWrite && (
        <Banner title={claimable ? 'Reclamalo para editar' : 'Este UID tiene dueño'} tone="warn">
          {claimable ? (
            <>
              Nadie reclamó el UID {uid} todavía, así que no hay key que pueda escribirlo y {what}{' '}
              queda en modo lectura. Reclamalo y quedate con la key que te devuelve.{' '}
              <Button tone="accent" size="sm" onClick={access.claim} disabled={claiming}>
                {claiming ? 'Reclamando…' : 'Reclamar este UID'}
              </Button>
            </>
          ) : (
            <>
              Esta computadora no guarda la key del UID {uid}, así que {what} queda en modo lectura.
              Pegá la key en <Link to={`/account/${uid}/credentials`}>Conectar HoYoLAB</Link>, o
              importá el Chronicle con la extensión para que el backend te dé una nueva.
            </>
          )}
        </Banner>
      )}

      {error && <StatusMessage kind="error">{error}</StatusMessage>}
    </>
  );
}
