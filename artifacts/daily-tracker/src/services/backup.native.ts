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
import type { CleanupTarget, Snapshot } from './backup';

export type { CleanupTarget, Snapshot } from './backup';

const DIR_NAME = 'backup';
/** Scratch directory for the half-written copy: NOT in the backup rules, so a crash mid-write never leaves a plaintext orphan eligible for backup. */
const TMP_DIR_NAME = 'backup-tmp';
const FILE_NAME = 'snapshot.json';
/**
 * The finished new snapshot on its way to `snapshot.json`. expo-file-system's `move` deletes an
 * existing destination *before* the rename (CopyMoveStrategy.kt), so for a moment there is no
 * `snapshot.json`; this file, already complete and inside the backed-up directory, covers that
 * moment: whoever finds it next (the app, or a restored phone) finishes the move.
 */
const NEXT_FILE_NAME = 'snapshot.next.json';
/**
 * A snapshot this build could not read (made by a newer app, or damaged), moved aside so the
 * hourly write never overwrites the only copy of someone's data. It stays inside the backup
 * directory, so Android keeps carrying it until a newer app restores it or the user deletes it.
 * Every copy gets its own name: a second unreadable snapshot must never replace the first.
 */
const KEPT_PREFIX = 'snapshot.kept';
const LEGACY_KEPT_FILE_NAME = 'snapshot.kept.json';
/**
 * Marker outside the backup directory (never backed up, so a restored phone never inherits it):
 * an erase, opt-out or "start fresh" asked for the snapshot to go — or "forget" asked for the kept
 * copies. Written before the delete is queued, removed once the delete succeeded, checked on
 * start — a process killed between the two still cleans up.
 */
const CLEANUP_MARKER = 'backup-cleanup.pending';

function backupDir(): Directory {
  return new Directory(Paths.document, DIR_NAME);
}

function snapshotFile(): File {
  return new File(backupDir(), FILE_NAME);
}

function nextFile(): File {
  return new File(backupDir(), NEXT_FILE_NAME);
}

function markerFile(): File {
  return new File(Paths.document, CLEANUP_MARKER);
}

function isKeptName(name: string): boolean {
  return name === LEGACY_KEPT_FILE_NAME || (name.startsWith(`${KEPT_PREFIX}.`) && name.endsWith('.json'));
}

/**
 * Finish an interrupted replacement: a complete `snapshot.next.json` always outranks whatever
 * `snapshot.json` holds (it only ever comes into being as a finished file, by rename).
 */
async function recoverSnapshot(): Promise<void> {
  const next = nextFile();
  if (!next.exists) return;
  try {
    await next.move(snapshotFile(), { overwrite: true });
  } catch (err) {
    console.warn('[backup] could not finish an interrupted snapshot write', err);
  }
}

export async function readSnapshot(): Promise<Snapshot | null> {
  await recoverSnapshot();
  const file = snapshotFile();
  if (!file.exists) return null;
  return { text: await file.text(), writtenAt: file.modificationTime ?? null };
}

export async function snapshotWrittenAt(): Promise<number | null> {
  await recoverSnapshot();
  const file = snapshotFile();
  return file.exists ? (file.modificationTime ?? 0) : null;
}

/**
 * What tells one snapshot file from another without reading it: write time and size together. A
 * file with different bytes and the same stamp is not something an ordinary write produces, so a
 * stamp this process saw is proof enough that the bytes are the ones it validated.
 */
export async function snapshotStamp(): Promise<string | null> {
  await recoverSnapshot();
  const file = snapshotFile();
  if (!file.exists) return null;
  return `${file.modificationTime ?? 0}:${file.size ?? -1}`;
}

/**
 * Writes to a temp file first (in a sibling directory the backup rules do not include), renames
 * it to `snapshot.next.json` inside the backup directory, then moves that over `snapshot.json`.
 * A crash mid-write leaves a torn file only where nothing backs it up; a crash mid-replace
 * leaves the complete `next` copy, which `recoverSnapshot` promotes on the next read.
 */
export async function writeSnapshot(text: string): Promise<void> {
  const dir = backupDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const tmpDir = new Directory(Paths.document, TMP_DIR_NAME);
  if (!tmpDir.exists) tmpDir.create({ intermediates: true });
  const tmp = new File(tmpDir, `${FILE_NAME}.tmp`);
  tmp.create({ overwrite: true });
  tmp.write(text);
  await tmp.move(nextFile(), { overwrite: true });
  await nextFile().move(snapshotFile(), { overwrite: true });
}

/**
 * Removes the snapshot and anything else in the backup directories ("deleted" must mean deleted),
 * the kept copies included. The pending-cleanup marker is cleared only when everything went; a
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
  clearMarker();
}

/** Moves the current snapshot aside under a name of its own; false when there was none. */
export async function setAsideSnapshot(): Promise<boolean> {
  await recoverSnapshot();
  const file = snapshotFile();
  if (!file.exists) return false;
  const stamp = file.modificationTime ?? Date.now();
  let target = new File(backupDir(), `${KEPT_PREFIX}.${stamp}.json`);
  for (let n = 1; target.exists; n += 1) target = new File(backupDir(), `${KEPT_PREFIX}.${stamp}-${n}.json`);
  await file.move(target, { overwrite: false });
  return true;
}

/** Every snapshot set aside earlier, newest first. */
export async function readKeptSnapshots(): Promise<Snapshot[]> {
  const dir = backupDir();
  if (!dir.exists) return [];
  const out: Snapshot[] = [];
  for (const item of dir.list()) {
    if (!(item instanceof File) || !isKeptName(item.name)) continue;
    out.push({ text: await item.text(), writtenAt: item.modificationTime ?? null });
  }
  return out.sort((a, b) => (b.writtenAt ?? 0) - (a.writtenAt ?? 0));
}

/** Removes every kept copy; the marker (when it asked for the kept copies) is cleared only when all went. */
export async function deleteKeptSnapshots(): Promise<void> {
  const dir = backupDir();
  let failed = false;
  if (dir.exists) {
    for (const item of dir.list()) {
      if (!(item instanceof File) || !isKeptName(item.name)) continue;
      try {
        item.delete();
      } catch (err) {
        failed = true;
        console.warn('[backup] could not delete', item.name, err);
      }
    }
  }
  if (failed) throw new Error('Could not remove the set-aside copy; it will be retried on the next start.');
  if (readMarker() === 'kept') clearMarker();
}

export async function markCleanupPending(target: CleanupTarget = 'all'): Promise<void> {
  const marker = markerFile();
  // "Everything" outranks "only the kept copies"; never narrow a recorded intent.
  if (marker.exists && (readMarker() === 'all' || target === 'kept')) return;
  marker.create({ overwrite: true });
  marker.write(target);
}

/** The cleanup a previous run recorded but never finished, or null. */
export async function cleanupPending(): Promise<CleanupTarget | null> {
  return readMarker();
}

/** Withdraws a recorded cleanup: the person restored the very data it was about to remove. */
export async function cancelCleanup(): Promise<void> {
  clearMarker();
}

function readMarker(): CleanupTarget | null {
  const marker = markerFile();
  if (!marker.exists) return null;
  try {
    // Older builds wrote a timestamp: that was always "everything".
    return marker.textSync().trim() === 'kept' ? 'kept' : 'all';
  } catch {
    return 'all';
  }
}

function clearMarker(): void {
  const marker = markerFile();
  if (marker.exists) marker.delete();
}
