/**
 * The backup file format shared by the web and native export/import code.
 *
 * Kept in its own module on purpose: `transfer.ts` / `transfer.native.ts` are a
 * platform-split pair, and on Android/iOS Metro resolves `./transfer` to the
 * `.native` file itself — so the native file can only share code with web
 * through a third module like this one (a self-import there is an infinite
 * getter loop at startup).
 *
 * The file is the same shape the stores persist (`TrackerState`), plus two
 * informational fields, so a backup can be re-imported with `parseState`.
 */
import type { TrackerState } from '@/src/state/types';
import { checkEnvelope, decryptBackup, encryptBackup, isEncryptedBackup, type EncryptedBackup } from './backupCrypto';
import { parseState, StorageError } from './store';

/** Largest file we will parse (characters). A decade of dense logging is a few MB. */
export const MAX_IMPORT_CHARS = 64 * 1024 * 1024;
/** Cache sub-directory for files handed to the share sheet (see services/transferCache). */
export const EXPORT_SCRATCH_DIR = 'exports';

export interface ExportFile extends TrackerState {
  app: 'daily-tracker';
  exportedAt: string;
}

/**
 * `daily-tracker-2026-10-25.json`, or with `suffix` `daily-tracker-2026-10-25-k3f9.json`. The
 * native exporter adds a random suffix so the scratch path in the cache directory is not
 * guessable by another app that was once handed a share URI for it.
 */
export function exportFileName(now = new Date(), suffix?: string): string {
  const tail = suffix ? `-${suffix.replace(/[^a-z0-9]/gi, '').slice(0, 8)}` : '';
  return `daily-tracker-${now.toISOString().slice(0, 10)}${tail}.json`;
}

/** Short random tag for file names (base-36 of secure random bytes). */
export function randomFileTag(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** The file text: plain JSON, or — with a password — the encrypted envelope around that JSON. */
export function serializeExport(state: TrackerState, now = new Date(), password?: string): string {
  const file: ExportFile = { app: 'daily-tracker', exportedAt: now.toISOString(), ...state };
  const json = JSON.stringify(file, null, 2);
  if (!password) return json;
  return JSON.stringify(encryptBackup(json, password, { now }), null, 2);
}

export type InspectedExport = { kind: 'plain'; state: TrackerState } | { kind: 'encrypted'; file: EncryptedBackup };

/**
 * Look at a chosen file: a readable backup, or a locked one that needs its
 * password. A locked file has its header checked here, so a damaged or hostile
 * envelope is refused before the user is asked to type anything.
 */
export function inspectExport(text: string): InspectedExport {
  if (text.length > MAX_IMPORT_CHARS) throw new StorageError('That file is too large to be a Daily Tracker backup.');
  const raw = parseJson(text);
  if (isEncryptedBackup(raw)) {
    checkEnvelope(raw);
    return { kind: 'encrypted', file: raw };
  }
  return { kind: 'plain', state: parseState(raw) };
}

/** Open a password-protected backup. Throws StorageError on a wrong password or damaged file. */
export function unlockExport(file: EncryptedBackup, password: string): TrackerState {
  return parseState(parseJson(decryptBackup(file, password)));
}

/** Parse the text of a plain (unencrypted) backup. Throws StorageError with a user-readable message. */
export function parseExport(text: string): TrackerState {
  const inspected = inspectExport(text);
  if (inspected.kind === 'encrypted') throw new StorageError('This backup is password-protected.');
  return inspected.state;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new StorageError('That file is not valid JSON.');
  }
}

export function describeImport(state: TrackerState): string {
  const habits = state.habits.filter((h) => !h.archived).length;
  const logs = state.entries.length + state.water.length + state.snacks.length + state.mind.length;
  return `${habits} active habit${habits === 1 ? '' : 's'} and ${logs} log entr${logs === 1 ? 'y' : 'ies'}`;
}
