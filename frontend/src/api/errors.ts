import { ApiError } from './client';

export const FORBIDDEN_MESSAGE =
  'Este UID tiene dueño y esta computadora no guarda su key, así que solo se puede mirar. Pegá la key en «Conectar HoYoLAB», o importá el Chronicle con la extensión para recuperarla.';

export const UNCLAIMED_MESSAGE =
  'Nadie reclamó este UID todavía, así que no hay key que pueda escribirlo. Reclamalo y quedate con la key que te devuelve.';

const FORBIDDEN_HINT = 'account-key';
const UNCLAIMED_HINT = 'claim the account';

export function isMissingKeyError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.detail.toLowerCase().includes(FORBIDDEN_HINT)
  );
}

export function isUnclaimedError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.detail.toLowerCase().includes(UNCLAIMED_HINT)
  );
}

export function describeError(error: unknown): string {
  if (isMissingKeyError(error)) return FORBIDDEN_MESSAGE;
  if (isUnclaimedError(error)) return UNCLAIMED_MESSAGE;
  if (error instanceof ApiError) return messageForStatus(error);
  if (error instanceof TypeError) return NETWORK_MESSAGE;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

const NETWORK_MESSAGE = 'No pudimos hablar con el backend. Fijate que esté levantado.';

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
