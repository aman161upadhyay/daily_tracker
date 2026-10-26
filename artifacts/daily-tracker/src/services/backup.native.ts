/**
 * Auto Backup snapshot — Android / iOS.
 *
 * Android's Auto Backup copies app-private files to the user's Google account
 * (client-side encrypted since Android 9). Backing up the live SQLite database
 * would risk restoring a half-written WAL, so the backup rules
 * (plugins/withBackupRules.js) include *only* `files/backup/`, where this
 * module keeps a whole-state snapshot in the export format. After a restore the
 * database is empty, the snapshot is there, and onboarding offers "Welcome back".
 * Never import './backup' from here.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { Snapshot } from './backup';

export type { Snapshot } from './backup';

const DIR_NAME = 'backup';
/** Scratch directory for the half-written copy: NOT in the backup rules, so a crash mid-write never leaves a plaintext orphan eligible for backup. */
const TMP_DIR_NAME = 'backup-tmp';
const FILE_NAME = 'snapshot.json';
/**
 * A snapshot this build could not read (made by a newer app, or damaged), moved aside so the
 * hourly write never overwrites the only copy of someone's data. It stays inside the backup
 * directory, so Android keeps carrying it until a newer app restores it or the user deletes it.
 */
const KEPT_FILE_NAME = 'snapshot.kept.json';
/**
 * Marker outside the backup directory (never backed up, so a restored phone never inherits it):
 * an erase or opt-out asked for the snapshot to go. Written before the delete is queued, removed
 * once the delete succeeded, checked on start — a process killed between the two still cleans up.
 */
const CLEANUP_MARKER = 'backup-cleanup.pending';

function snapshotFile(): File {
  return new File(new Directory(Paths.document, DIR_NAME), FILE_NAME);
}

function keptFile(): File {
  return new File(new Directory(Paths.document, DIR_NAME), KEPT_FILE_NAME);
}

function markerFile(): File {
  return new File(Paths.document, CLEANUP_MARKER);
}

export async function readSnapshot(): Promise<Snapshot | null> {
  const file = snapshotFile();
  if (!file.exists) return null;
  return { text: await file.text(), writtenAt: file.modificationTime ?? null };
}

export async function snapshotWrittenAt(): Promise<number | null> {
  const file = snapshotFile();
  return file.exists ? (file.modificationTime ?? 0) : null;
}

/**
 * Writes to a temp file first (in a sibling directory the backup rules do not
 * include), then moves it into place, so a crash mid-write never leaves a torn
 * snapshot — nor a stray copy that Android would back up after an erase.
 */
export async function writeSnapshot(text: string): Promise<void> {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  const tmpDir = new Directory(Paths.document, TMP_DIR_NAME);
  if (!tmpDir.exists) tmpDir.create({ intermediates: true });
  const tmp = new File(tmpDir, `${FILE_NAME}.tmp`);
  tmp.create({ overwrite: true });
  tmp.write(text);
  await tmp.move(snapshotFile(), { overwrite: true });
}

/**
 * Removes the snapshot and anything else in the backup directories ("deleted" must mean deleted),
 * the kept copy included. The pending-cleanup marker is cleared only when everything went; a
 * failure leaves it so the next start tries again.
 */
export async function deleteSnapshot(): Promise<void> {
  let failed = false;
  for (const name of [DIR_NAME, TMP_DIR_NAME]) {
    const dir = new Directory(Paths.document, name);
    if (!dir.exists) continue;
    for (const item of dir.list()) {
      try {
        item.delete();
      } catch (err) {
        failed = true;
        console.warn('[backup] could not delete', item.name, err);
      }
    }
  }
  if (failed) throw new Error('Could not remove the phone-backup copy; it will be retried on the next start.');
  const marker = markerFile();
  if (marker.exists) marker.delete();
}

export async function setAsideSnapshot(): Promise<boolean> {
  const file = snapshotFile();
  if (!file.exists) return false;
  await file.move(keptFile(), { overwrite: true });
  return true;
}

export async function readKeptSnapshot(): Promise<Snapshot | null> {
  const file = keptFile();
  if (!file.exists) return null;
  return { text: await file.text(), writtenAt: file.modificationTime ?? null };
}

export async function deleteKeptSnapshot(): Promise<void> {
  const file = keptFile();
  if (file.exists) file.delete();
}

export async function markCleanupPending(): Promise<void> {
  const marker = markerFile();
  if (marker.exists) return;
  marker.create({ overwrite: true });
  marker.write(String(Date.now()));
}

export async function cleanupPending(): Promise<boolean> {
  return markerFile().exists;
}
