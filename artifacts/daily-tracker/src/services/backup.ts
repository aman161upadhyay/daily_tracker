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
