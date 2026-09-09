import { useState } from 'react';
import Banner from './ui/Banner';

interface AccountKeyBannerProps {
  uid: string;
  accountKey: string;
  stored: boolean;
  onDismiss?: () => void;
}

export default function AccountKeyBanner({
  uid,
  accountKey,
  stored,
  onDismiss,
}: AccountKeyBannerProps) {
  const [copied, setCopied] = useState(false);

  function copyKey() {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(accountKey).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  const title = stored
    ? 'Guardá esta key: no se vuelve a mostrar'
    : 'Copiá esta key ahora: no se pudo guardar';

  return (
    <Banner title={title} tone="warn" onDismiss={onDismiss}>
      Es lo único que autoriza a editar el UID {uid}. El backend la guarda hasheada, así que ni él
      la puede volver a leer.{' '}
      {stored
        ? 'Ya quedó guardada en este navegador; copiala si vas a abrir el tracker desde otra máquina.'
        : 'Este navegador no la dejó guardar, así que anotala vos antes de cerrar: sin ella el UID queda en modo lectura y recuperarla cuesta rotarla en el servidor.'}{' '}
      <code className="ne-key">{accountKey}</code>{' '}
      <button type="button" className="ne-ghost" onClick={copyKey}>
        {copied ? 'Copiada' : 'Copiar'}
      </button>
    </Banner>
  );
}
