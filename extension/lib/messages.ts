import type { ChroniclePayloads } from './chronicle';
import { userMessage, type RetcodeKind, type RoleRef } from './hoyolab';
import type { RosterAgent, RosterSnapshot } from './roster';

export type SectionId =
  | 'record_card'
  | 'index'
  | 'avatar_basic'
  | 'avatar_info'
  | 'buddy_info'
  | 'shiyu_defense_1'
  | 'shiyu_defense_2'
  | 'deadly_assault_1'
  | 'deadly_assault_2'
  | 'lost_void';

export interface SectionFailure {
  section: SectionId;
  kind: RetcodeKind;
  retcode: number | null;
  traceId: string | null;
  /** Lo que dijo HoYoLAB, crudo. */
  message: string;
  /** El texto ya escrito, para cuando quien arma el fallo sabe más que el genérico por retcode. */
  text?: string;
}

/** El texto que ve el usuario para un fallo. El `x-trace-id` viaja siempre. */
export function failureText(failure: SectionFailure): string {
  if (!failure.text) return userMessage(failure.kind, failure);
  return failure.traceId ? `${failure.text} [trace: ${failure.traceId}]` : failure.text;
}

export interface SyncResult {
  role: RoleRef | null;
  sections: ChroniclePayloads;
  failures: SectionFailure[];
  fatal: { kind: RetcodeKind | 'no_role'; message: string } | null;
  /** El roster que devolvió `avatar/basic`, para recalcular el snapshot tras el POST. */
  roster: RosterAgent[];
  /** Los agentes cuya build viajó de verdad en este import. */
  fetchedAvatarIds: number[];
}

export type ProgressStatus = 'fetching' | 'done' | 'failed';

/** Avance dentro de una sección que son muchos requests; el popup lo muestra "Builds 12/36". */
export interface SectionProgress {
  done: number;
  total: number;
}

export interface ProgressMessage {
  type: 'zzz-progress';
  section: SectionId;
  status: ProgressStatus;
  detail?: string;
  progress?: SectionProgress;
}

export interface StartImportMessage {
  type: 'zzz-start-import';
  /** Ignora el snapshot y pide la build de todos los agentes. */
  reimportAll?: boolean;
}

export interface RunSyncMessage {
  type: 'zzz-run-sync';
  language: string;
  rosterSnapshot: RosterSnapshot;
  reimportAll: boolean;
}

export interface PingMessage {
  type: 'zzz-ping';
}

export interface ImportStatusMessage {
  type: 'zzz-import-status';
}

export interface ImportDoneMessage {
  type: 'zzz-import-done';
  outcome: ImportOutcome;
}

export type ExtensionMessage =
  | ProgressMessage
  | StartImportMessage
  | RunSyncMessage
  | PingMessage
  | ImportStatusMessage
  | ImportDoneMessage;

export interface ImportOutcome {
  ok: boolean;
  message: string;
  uid?: string;
  accountUrl?: string;
  warnings?: string[];
}

export interface LastImport {
  at: string;
  uid: string;
  nickname?: string;
  summary: string;
  accountUrl?: string;
}
