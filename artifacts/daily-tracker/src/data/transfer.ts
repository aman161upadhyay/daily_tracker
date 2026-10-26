/**
 * Export / import of the whole state as JSON — web implementation.
 * Native (Android/iOS) lives in transfer.native.ts; Metro picks the right one.
 * The file format itself is in transferFormat.ts (shared by both).
 */
import type { TrackerState } from '@/src/state/types';
import { exportFileName, serializeExport } from './transferFormat';

export { describeImport, exportFileName, inspectExport, parseExport, serializeExport, unlockExport, type ExportFile, type InspectedExport } from './transferFormat';

/** Triggers a browser download. Resolves once the download has been handed to the browser. */
export async function exportState(state: TrackerState, password?: string): Promise<void> {
  const blob = new Blob([serializeExport(state, new Date(), password)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file picker and returns the file's text, or null if the user cancelled. */
export function pickImport(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await file.text());
      } catch (err) {
        reject(err);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
