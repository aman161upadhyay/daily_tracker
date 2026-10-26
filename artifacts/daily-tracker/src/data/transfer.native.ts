/**
 * Export / import of the whole state as JSON — Android / iOS implementation.
 * Writes the backup to the cache directory and hands it to the share sheet
 * (Drive, Files, email…); import goes through the system document picker.
 * Never import './transfer' from here: on native that path resolves to this file.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { TrackerState } from '@/src/state/types';
import { StorageError } from './store';
import { exportFileName, serializeExport } from './transferFormat';

export { describeImport, exportFileName, inspectExport, parseExport, serializeExport, unlockExport, type ExportFile, type InspectedExport } from './transferFormat';

export async function exportState(state: TrackerState, password?: string): Promise<void> {
  const file = new File(Paths.cache, exportFileName());
  if (file.exists) file.delete();
  file.create();
  file.write(serializeExport(state, new Date(), password));
  if (!(await Sharing.isAvailableAsync())) {
    throw new StorageError(`Sharing is not available on this device. The backup was saved to ${file.uri}.`);
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Daily Tracker backup', UTI: 'public.json' });
}

/** Opens the document picker and returns the file's text, or null if the user cancelled. */
export async function pickImport(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return new File(asset.uri).text();
}
