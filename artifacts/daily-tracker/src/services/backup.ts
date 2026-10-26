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

export async function readSnapshot(): Promise<Snapshot | null> {
  return null;
}

/** Epoch ms of the current snapshot, or null when there is none. */
export async function snapshotWrittenAt(): Promise<number | null> {
  return null;
}

export async function writeSnapshot(_text: string): Promise<void> {}

export async function deleteSnapshot(): Promise<void> {}

/** Moves the current snapshot out of the way (kept for a newer app to read); false when there was none. */
export async function setAsideSnapshot(): Promise<boolean> {
  return false;
}

/** The snapshot set aside earlier, if any. */
export async function readKeptSnapshot(): Promise<Snapshot | null> {
  return null;
}

export async function deleteKeptSnapshot(): Promise<void> {}

/** Records that the snapshot must go (erase, backup turned off) until `deleteSnapshot` has succeeded. */
export async function markCleanupPending(): Promise<void> {}

/** Whether a recorded cleanup never completed (the app died before the delete ran). */
export async function cleanupPending(): Promise<boolean> {
  return false;
}
