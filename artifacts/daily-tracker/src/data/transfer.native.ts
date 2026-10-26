/**
 * Export / import of the whole state as JSON — Android / iOS implementation.
 * Writes the backup to the cache directory and hands it to the share sheet
 * (Drive, Files, email…); import goes through the system document picker.
 * Never import './transfer' from here: on native that path resolves to this file.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { purgeTransferCache } from '@/src/services/transferCache';
import type { TrackerState } from '@/src/state/types';
import { StorageError } from './store';
import { secureRandomBytes } from './secureRandom';
import { EXPORT_SCRATCH_DIR, exportFileName, MAX_IMPORT_CHARS, randomFileTag, serializeExport } from './transferFormat';

export { describeImport, exportFileName, inspectExport, parseExport, serializeExport, unlockExport, type ExportFile, type InspectedExport } from './transferFormat';

/**
 * The file goes to a scratch directory the share sheet can read; older
 * exports there are removed first (see services/transferCache).
 */
export async function exportState(state: TrackerState, password?: string): Promise<void> {
  await purgeTransferCache();
  const dir = new Directory(Paths.cache, EXPORT_SCRATCH_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, exportFileName(new Date(), randomFileTag(secureRandomBytes(6))));
  if (file.exists) file.delete();
  try {
    file.create();
    file.write(serializeExport(state, new Date(), password));
  } catch (err) {
    removeScratchFile(file.uri);
    throw err;
  }
  if (!(await Sharing.isAvailableAsync())) {
    removeScratchFile(file.uri);
    throw new StorageError('Sharing is not available on this device, so the backup could not be handed to another app.');
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Daily Tracker backup', UTI: 'public.json' });
  // Not deleted here: Drive, Gmail and friends read the URI after the sheet has closed, often from
  // a background upload. `purgeTransferCache` removes exports once they are an hour old.
}

/**
 * Opens the document picker and returns the file's text, or null if the user
 * cancelled. The picker's cached copy is removed once read; a file far larger
 * than any backup is refused before it is loaded into memory.
 */
export async function pickImport(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  try {
    const file = new File(asset.uri);
    // The cached copy's real size first; the picker's own figure is a hint some providers get wrong.
    let size = 0;
    try {
      size = file.size ?? 0;
    } catch {
      size = 0;
    }
    if (!size) size = asset.size ?? 0;
    if (size > MAX_IMPORT_CHARS) throw new StorageError('That file is too large to be a Daily Tracker backup.');
    const text = await file.text();
    if (text.length > MAX_IMPORT_CHARS) throw new StorageError('That file is too large to be a Daily Tracker backup.');
    return text;
  } finally {
    removeScratchFile(asset.uri);
  }
}

/** The picker's cached copy of an import is plaintext health data; remove it once read. */
function removeScratchFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn('[transfer] could not remove a scratch file', err);
  }
}
