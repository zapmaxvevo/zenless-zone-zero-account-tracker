import { useState } from 'react';
import Banner from './ui/Banner';

interface AccountKeyBannerProps {
  uid: string;
  accountKey: string;
  onDismiss?: () => void;
}

export default function AccountKeyBanner({ uid, accountKey, onDismiss }: AccountKeyBannerProps) {
  const [copied, setCopied] = useState(false);

  function copyKey() {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(accountKey).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <Banner title="Guardá esta key: no se vuelve a mostrar" tone="warn" onDismiss={onDismiss}>
      Es lo único que autoriza a editar el UID {uid}. El backend la guarda hasheada, así que ni él
      la puede volver a leer. Ya quedó guardada en este navegador; copiala si vas a abrir el tracker
      desde otra máquina. <code className="ne-key">{accountKey}</code>{' '}
      <button type="button" className="ne-ghost" onClick={copyKey}>
        {copied ? 'Copiada' : 'Copiar'}
      </button>
    </Banner>
  );
}
