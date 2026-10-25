/**
 * Export / import of the whole state as JSON — web implementation.
 * Native (Android/iOS) lives in transfer.native.ts; Metro picks the right one.
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

/** Triggers a browser download. Resolves once the download has been handed to the browser. */
export async function exportState(state: TrackerState): Promise<void> {
  const blob = new Blob([serializeExport(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file picker and returns the parsed state, or null if the user cancelled. */
export function pickImport(): Promise<TrackerState | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(parseExport(await file.text()));
      } catch (err) {
        reject(err);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
