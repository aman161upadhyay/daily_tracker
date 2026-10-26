/**
 * Export / import scratch files — Android / iOS.
 *
 * An export is written to the cache directory so the share sheet can hand it
 * to another app; the document picker copies an import there too. Both are
 * plaintext health data sitting in a directory the user never sees, so they
 * are removed again: the import copy right after it was read, exports once
 * they are an hour old (receiving apps such as Drive may still be reading a
 * just-shared file), everything on "Erase everything".
 * Never import './transferCache' from here.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { EXPORT_SCRATCH_DIR } from '@/src/data/transferFormat';

const KEEP_EXPORT_MS = 60 * 60 * 1000;

const exportDirectory = () => new Directory(Paths.cache, EXPORT_SCRATCH_DIR);
/** Where expo-document-picker leaves its copy of a picked file (an import that was cancelled or failed to parse stays there). */
const pickerDirectory = () => new Directory(Paths.cache, 'DocumentPicker');

function purgeDirectory(dir: Directory, opts: { all?: boolean }): void {
  if (!dir.exists) return;
  const cutoff = Date.now() - KEEP_EXPORT_MS;
  for (const item of dir.list()) {
    if (!(item instanceof File)) continue;
    const written = item.modificationTime ?? 0;
    if (opts.all || written < cutoff) {
      try {
        item.delete();
      } catch (err) {
        console.warn('[transfer] could not remove a scratch file', err);
      }
    }
  }
}

export async function purgeTransferCache(opts: { all?: boolean } = {}): Promise<void> {
  purgeDirectory(exportDirectory(), opts);
  purgeDirectory(pickerDirectory(), opts);
}

