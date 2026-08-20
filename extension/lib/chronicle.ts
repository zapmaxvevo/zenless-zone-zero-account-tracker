export const IMPORT_SOURCE = 'extension' as const;
export const EXTENSION_VERSION = '0.1.0';

export type ScheduleKey = '1' | '2';
export type RawPayload = Record<string, unknown>;

export interface ChroniclePayloads {
  index?: RawPayload | null;
  avatar_basic?: RawPayload | null;
  avatar_info?: RawPayload[] | null;
  buddy_info?: RawPayload | null;
  shiyu_defense?: Partial<Record<ScheduleKey, RawPayload | null>> | null;
  deadly_assault?: Partial<Record<ScheduleKey, RawPayload | null>> | null;
  lost_void?: RawPayload | null;
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
