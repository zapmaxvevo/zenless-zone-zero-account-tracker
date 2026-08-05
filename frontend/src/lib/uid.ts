/** Mismo patrón que `UID_PATTERN` en el backend. */
export const UID_PATTERN = /^\d{6,16}$/;

export function normalizeUid(raw: string): string {
  return raw.trim();
}

export function isValidUid(raw: string): boolean {
  return UID_PATTERN.test(normalizeUid(raw));
}

/** El motivo por el que un UID no sirve, o `null` si está bien. */
export function uidError(raw: string): string | null {
  const uid = normalizeUid(raw);
  if (!uid) return 'Escribí un UID.';
  if (!/^\d+$/.test(uid)) return 'El UID son solo números.';
  if (uid.length < 6) return 'El UID tiene al menos 6 dígitos.';
  if (uid.length > 16) return 'El UID tiene como mucho 16 dígitos.';
  return null;
}
