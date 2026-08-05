import { ApiError } from './client';

/**
 * Traduce un error de red o de API al mensaje que ve el usuario.
 *
 * El backend contesta en inglés y orientado al operador; acá le damos a cada status
 * el texto que le sirve a quien está mirando la pantalla.
 */
export function describeError(error: unknown): string {
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
