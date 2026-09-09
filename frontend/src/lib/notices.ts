import { ApiError } from '../api/client';
import { FORBIDDEN_MESSAGE, UNCLAIMED_MESSAGE, describeError, isRateLimited } from '../api/errors';
import type { ErrorCode } from '../api/types';
import { MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE } from '../api/types';

export interface Notice {
  title: string;
  text: string;
  tone: 'info' | 'warn';
}

const MODE_LABELS: Record<string, string> = {
  [MODE_SHIYU_DEFENSE]: 'Defensa Shiyu',
  [MODE_DEADLY_ASSAULT]: 'Asalto Mortal',
};

export function reportNotice(skipped: boolean, unavailable: string[]): Notice | null {
  if (skipped) {
    return {
      title: 'Sincronización salteada',
      text: 'Los datos ya estaban al día — HoYoLAB no devolvió cambios.',
      tone: 'warn',
    };
  }

  if (unavailable.length > 0) {
    const names = unavailable.map((mode) => MODE_LABELS[mode] ?? mode).join(' y ');
    return {
      title: 'Modos sin datos',
      text: `HoYoLAB no devolvió ${names} esta vez. El resto del Chronicle se guardó igual; probá de nuevo más tarde.`,
      tone: 'warn',
    };
  }

  return null;
}

const RATE_LIMITED: Notice = {
  title: 'HoYoLAB está frenando las consultas',
  text: 'No es un error: la cuenta queda en pausa unos minutos y después se puede sincronizar de nuevo.',
  tone: 'warn',
};

const BAD_CREDENTIALS: Notice = {
  title: 'Credenciales de HoYoLAB',
  text: 'HoYoLAB no aceptó las cookies guardadas (o no hay ninguna). Cargalas de nuevo desde la pantalla de conexión.',
  tone: 'info',
};

const NOTICES_BY_CODE: Partial<Record<ErrorCode, Notice>> = {
  captcha_required: {
    title: 'HoYoLAB pidió un captcha',
    text: 'No es un error: HoYoLAB pide una verificación que el tracker no puede resolver. La cuenta queda en pausa unos minutos; volvé a sincronizar más tarde.',
    tone: 'warn',
  },
  rate_limited: RATE_LIMITED,
  missing_credentials: BAD_CREDENTIALS,
  invalid_credentials: BAD_CREDENTIALS,
  data_not_public: {
    title: 'Chronicle privado',
    text: 'Esa cuenta tiene el Battle Chronicle en privado. Hay que hacerlo público desde HoYoLAB para poder leerlo.',
    tone: 'info',
  },
  forbidden: {
    title: 'Este UID tiene dueño',
    text: FORBIDDEN_MESSAGE,
    tone: 'info',
  },
  unclaimed_account: {
    title: 'La cuenta no está reclamada',
    text: UNCLAIMED_MESSAGE,
    tone: 'info',
  },
};

export function errorNotice(caught: unknown): Notice {
  if (!(caught instanceof ApiError)) {
    return { title: 'No se pudo sincronizar', text: describeError(caught), tone: 'info' };
  }

  const byCode = caught.code ? NOTICES_BY_CODE[caught.code as ErrorCode] : undefined;
  if (byCode) return byCode;

  if (isRateLimited(caught)) return RATE_LIMITED;
  if (caught.status === 401) return BAD_CREDENTIALS;

  return { title: 'No se pudo sincronizar', text: describeError(caught), tone: 'info' };
}
