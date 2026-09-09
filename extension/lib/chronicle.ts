import { ZZZ_GAME_ID } from './hoyolab';

export const IMPORT_SOURCE = 'extension' as const;
export const EXTENSION_VERSION = '0.1.0';

export type ScheduleKey = '1' | '2';
export type RawPayload = Record<string, unknown>;

export interface ChroniclePayloads {
  record_card?: RawPayload | null;
  index?: RawPayload | null;
  avatar_basic?: RawPayload | null;
  avatar_info?: RawPayload[] | null;
  buddy_info?: RawPayload | null;
  shiyu_defense?: Partial<Record<ScheduleKey, RawPayload | null>> | null;
  deadly_assault?: Partial<Record<ScheduleKey, RawPayload | null>> | null;
  lost_void?: RawPayload | null;
}

// El `data` de `index` no trae UID, nickname ni nivel: lo único que los tiene es
// `getGameRecordCard`. Por eso su entrada de ZZZ viaja como sección propia.
const RECORD_CARD_FIELDS = [
  'game_role_id',
  'nickname',
  'region',
  'level',
  'is_public',
  'has_role',
] as const;

/**
 * La entrada de ZZZ de `getGameRecordCard`, recortada a lo que el tracker usa. Se filtra por
 * dos razones: la card trae también las otras cuentas de HoYoverse del usuario (Genshin, HSR…)
 * y el tracker no tiene por qué verlas, y de la entrada de ZZZ sólo importan estos campos.
 * Devuelve null si la card falló o no tiene una cuenta de ZZZ: la sección es opcional.
 */
export function recordCardSection(cardData: unknown): RawPayload | null {
  const list = (cardData as { list?: unknown } | null | undefined)?.list;
  if (!Array.isArray(list)) return null;
  const zzz = list.find(
    (entry) => Number((entry as { game_id?: unknown } | null)?.game_id) === ZZZ_GAME_ID,
  ) as Record<string, unknown> | undefined;
  if (!zzz) return null;
  const section: RawPayload = {};
  for (const field of RECORD_CARD_FIELDS) {
    if (zzz[field] !== undefined) section[field] = zzz[field];
  }
  return section;
}

export interface ChronicleImportWrite {
  source: typeof IMPORT_SOURCE;
  extension_version: string;
  captured_at: string;
  region: string;
  language: string;
  payloads: ChroniclePayloads;
}

export function buildImportPayload(args: {
  region: string;
  language: string;
  sections: ChroniclePayloads;
  capturedAt?: Date;
  extensionVersion?: string;
}): ChronicleImportWrite {
  const entries = Object.entries(args.sections).filter(([, value]) => value !== undefined);
  return {
    source: IMPORT_SOURCE,
    extension_version: args.extensionVersion ?? EXTENSION_VERSION,
    captured_at: (args.capturedAt ?? new Date()).toISOString(),
    region: args.region,
    language: args.language,
    payloads: Object.fromEntries(entries) as ChroniclePayloads,
  };
}

export interface ChronicleImportResponse {
  account_uid?: string;
  /**
   * Sólo viene cuando la key rotó, que es cuando el import reclama una cuenta que estaba libre
   * (`unclaimed`/`provisional`). Se muestra una vez y hay que guardarla: el backend la tiene
   * hasheada y no la vuelve a devolver. Un import con la key vigente no rota y no la trae; uno
   * sin key contra una cuenta ya `verified` no llega a esta respuesta: es un 403.
   */
  account_key?: string | null;
  skipped?: boolean;
  agents_synced?: number;
  bangboos_synced?: number;
  lost_void_synced?: boolean;
  builds_synced?: number;
  unavailable_modes?: string[];
  skipped_sections?: string[];
  runs?: unknown[];
}

export function summarizeImport(response: ChronicleImportResponse): string {
  const parts = [
    `${response.agents_synced ?? 0} agentes`,
    `${response.bangboos_synced ?? 0} bangboos`,
    `${(response.runs ?? []).length} runs`,
  ];
  if (response.lost_void_synced) parts.push('Lost Void');
  let text = `Importado: ${parts.join(', ')}`;
  if (response.skipped_sections?.length) {
    text += ` — secciones saltadas: ${response.skipped_sections.join(', ')}`;
  }
  if (response.unavailable_modes?.length) {
    text += ` — sin datos: ${response.unavailable_modes.join(', ')}`;
  }
  return text;
}
