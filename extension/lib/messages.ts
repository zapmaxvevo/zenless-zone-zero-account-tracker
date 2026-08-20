import type { ChroniclePayloads } from './chronicle';
import type { RetcodeKind, RoleRef } from './hoyolab';

export type SectionId =
  | 'record_card'
  | 'index'
  | 'avatar_basic'
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
  message: string;
}

export interface SyncResult {
  role: RoleRef | null;
  sections: ChroniclePayloads;
  failures: SectionFailure[];
  fatal: { kind: RetcodeKind | 'no_role'; message: string } | null;
}

export type ProgressStatus = 'fetching' | 'done' | 'failed';

export interface ProgressMessage {
  type: 'zzz-progress';
  section: SectionId;
  status: ProgressStatus;
  detail?: string;
}

export interface StartImportMessage {
  type: 'zzz-start-import';
}

export interface RunSyncMessage {
  type: 'zzz-run-sync';
  language: string;
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
