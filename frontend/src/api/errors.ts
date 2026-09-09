import { ApiError } from './client';
import type { ErrorCode } from './types';

export const FORBIDDEN_MESSAGE =
  'Este UID tiene dueño y esta computadora no guarda su key, así que solo se puede mirar. Si la key vigente está en otra instalación, pegala en «Conectar HoYoLAB».';

export const UNCLAIMED_MESSAGE =
  'Nadie reclamó este UID todavía, así que no hay key que pueda escribirlo. Reclamalo y quedate con la key que te devuelve.';

const CODE_FORBIDDEN: ErrorCode = 'forbidden';
const CODE_UNCLAIMED: ErrorCode = 'unclaimed_account';
const CODE_RATE_LIMITED: ErrorCode = 'rate_limited';
const CODE_NOT_FOUND: ErrorCode = 'not_found';

const MESSAGES_BY_CODE: Partial<Record<ErrorCode, string>> = {
  [CODE_FORBIDDEN]: FORBIDDEN_MESSAGE,
  [CODE_UNCLAIMED]: UNCLAIMED_MESSAGE,
};

export function isMissingKeyError(error: unknown): boolean {
  return error instanceof ApiError && error.code === CODE_FORBIDDEN;
}

export function isUnclaimedError(error: unknown): boolean {
  return error instanceof ApiError && error.code === CODE_UNCLAIMED;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.code === CODE_NOT_FOUND || error.status === 404);
}

export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && (error.code === CODE_RATE_LIMITED || error.status === 429);
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return messageForApiError(error);
  if (error instanceof TypeError) return NETWORK_MESSAGE;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

const NETWORK_MESSAGE = 'No pudimos hablar con el backend. Fijate que esté levantado.';

function messageForApiError(error: ApiError): string {
  const byCode = error.code ? MESSAGES_BY_CODE[error.code as ErrorCode] : undefined;
  return byCode ?? messageForStatus(error);
}

function messageForStatus(error: ApiError): string {
  switch (error.status) {
    case 404:
      return 'No encontramos esa cuenta. Revisá el UID: tiene que existir y estar en la vitrina pública del juego.';
    case 409:
      return 'Esa cuenta ya tiene ese agente: editalo desde el roster en vez de cargarlo de nuevo.';
    case 422:
      return `Los datos enviados no son válidos: ${error.detail}`;
    case 429:
      return 'Enka nos está limitando las consultas. Esperá un momento y volvé a intentar.';
    case 502:
      return 'Enka no está respondiendo. Probá de nuevo en un rato.';
    case 503:
      return 'Faltan los datos estáticos de Enka. Corré `uv run zzz-tracker sync-static` en el backend.';
    default:
      return error.detail;
  }
}
