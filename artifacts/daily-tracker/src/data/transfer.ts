/**
 * Export / import of the whole state as JSON — web implementation.
 * Native (Android/iOS) lives in transfer.native.ts; Metro picks the right one.
 * The file format itself is in transferFormat.ts (shared by both).
 */
import type { TrackerState } from '@/src/state/types';
import { secureRandomBytes } from './secureRandom';
import { exportFileName, randomFileTag, serializeExportAsync } from './transferFormat';

export { describeImport, exportFileName, inspectExport, parseExport, serializeExport, unlockExport, unlockExportAsync, type ExportFile, type InspectedExport } from './transferFormat';

/** Triggers a browser download. Resolves once the download has been handed to the browser. */
export async function exportState(state: TrackerState, password?: string): Promise<void> {
  const blob = new Blob([await serializeExportAsync(state, new Date(), password)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Same name shape as the phone (date plus a short random tag), so the guide's one description fits both.
  a.download = exportFileName(new Date(), randomFileTag(secureRandomBytes(6)));
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
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    Object.assign(input.style, { position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '1px', opacity: '0' });
    // The input sits in the document while the chooser is open: a detached one can be collected
    // before its change event in some browsers, and the "Import backup" button would stay busy.
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      if (fallback !== undefined) clearTimeout(fallback);
      window.removeEventListener('focus', onFocus);
      input.remove();
      run();
    };
    // Browsers without the cancel event fire no event at all when the chooser is dismissed; the
    // window regaining focus with no file chosen shortly after is read as a cancel.
    const onFocus = () => {
      if (fallback === undefined) fallback = setTimeout(() => finish(() => resolve(null)), 1500);
    };
    input.onchange = () => {
      if (fallback !== undefined) clearTimeout(fallback);
      fallback = undefined;
      window.removeEventListener('focus', onFocus);
      const file = input.files?.[0];
      if (!file) return finish(() => resolve(null));
      file.text().then(
        (text) => finish(() => resolve(text)),
        (err) => finish(() => reject(err)),
      );
    };
    input.oncancel = () => finish(() => resolve(null));
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}
