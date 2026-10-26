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
const FILE_NAME = 'snapshot.json';

function snapshotFile(): File {
  return new File(new Directory(Paths.document, DIR_NAME), FILE_NAME);
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

/** Writes to a temp file first, then swaps, so a crash mid-write never leaves a torn snapshot. */
export async function writeSnapshot(text: string): Promise<void> {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  const tmp = new File(dir, `${FILE_NAME}.tmp`);
  tmp.create({ overwrite: true });
  tmp.write(text);
  await tmp.move(snapshotFile(), { overwrite: true });
}

export async function deleteSnapshot(): Promise<void> {
  const file = snapshotFile();
  if (file.exists) file.delete();
}
