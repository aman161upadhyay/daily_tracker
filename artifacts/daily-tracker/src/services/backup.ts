/**
 * Auto Backup snapshot — web stub. The browser preview keeps its data in
 * localStorage and has no app-private files for Android to back up, so there
 * is never a snapshot here. Android lives in backup.native.ts; never import
 * this file from there.
 */

export interface Snapshot {
  /** The file text: the same format as a manual export. */
  text: string;
  /** Epoch ms when it was written, or null if the file system does not say. */
  writtenAt: number | null;
}

/** What a recorded cleanup must remove: everything in the backup directories, or only the kept copies. */
export type CleanupTarget = 'all' | 'kept';

export async function readSnapshot(): Promise<Snapshot | null> {
  return null;
}

/** Epoch ms of the current snapshot, or null when there is none. */
export async function snapshotWrittenAt(): Promise<number | null> {
  return null;
}

/** Write time and size of the current snapshot as one string, or null when there is none. */
export async function snapshotStamp(): Promise<string | null> {
  return null;
}

export async function writeSnapshot(_text: string): Promise<void> {}

export async function deleteSnapshot(): Promise<void> {}

/** Moves the current snapshot out of the way (kept for a newer app to read); false when there was none. */
export async function setAsideSnapshot(): Promise<boolean> {
  return false;
}

/** The snapshots set aside earlier, newest first. */
export async function readKeptSnapshots(): Promise<Snapshot[]> {
  return [];
}

export async function deleteKeptSnapshots(): Promise<void> {}

/** Records that the snapshot (or only the kept copies) must go until the delete has succeeded. */
export async function markCleanupPending(_target: CleanupTarget = 'all'): Promise<void> {}

/** The cleanup a previous run recorded but never finished (the app died before the delete ran), or null. */
export async function cleanupPending(): Promise<CleanupTarget | null> {
  return null;
}

/** Withdraws a recorded cleanup (the person restored the data it was about to remove). */
export async function cancelCleanup(): Promise<void> {}
