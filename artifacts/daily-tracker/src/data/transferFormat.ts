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
import { parseState, StorageError } from './store';

export interface ExportFile extends TrackerState {
  app: 'daily-tracker';
  exportedAt: string;
}

export function exportFileName(now = new Date()): string {
  return `daily-tracker-${now.toISOString().slice(0, 10)}.json`;
}

export function serializeExport(state: TrackerState, now = new Date()): string {
  const file: ExportFile = { app: 'daily-tracker', exportedAt: now.toISOString(), ...state };
  return JSON.stringify(file, null, 2);
}

/** Parse the text of a chosen file. Throws StorageError with a user-readable message. */
export function parseExport(text: string): TrackerState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new StorageError('That file is not valid JSON.');
  }
  return parseState(raw);
}

export function describeImport(state: TrackerState): string {
  const habits = state.habits.filter((h) => !h.archived).length;
  const logs = state.entries.length + state.water.length + state.snacks.length + state.mind.length;
  return `${habits} active habit${habits === 1 ? '' : 's'} and ${logs} log entr${logs === 1 ? 'y' : 'ies'}`;
}
