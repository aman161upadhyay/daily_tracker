/**
 * Whether the Android phone-backup copy is doing what Your data says it does. The snapshot the app
 * writes for Auto Backup, and the delete that "off" and "Erase everything" promise, run in the
 * background; a failure there used to be a console line, so the person read "Android keeps a copy"
 * while no copy was being kept, or "deleted" while the file stayed. BackupSync records the last
 * failure here and Your data shows it (with a Retry for a delete).
 */
import { useSyncExternalStore } from 'react';

export interface BackupFailure {
  at: number;
  /** `write`: the snapshot could not be written. `delete`: the copy could not be removed. */
  what: 'write' | 'delete';
  message: string;
}

let failure: BackupFailure | null = null;
const listeners = new Set<() => void>();

export function setBackupFailure(next: BackupFailure | null): void {
  if (next === failure) return;
  failure = next;
  for (const l of listeners) l();
}

/** Record a failure of `what`, or clear the shown one when a later attempt of the same kind succeeded. */
export function reportBackup(what: BackupFailure['what'], err: unknown | null): void {
  if (err === null) {
    if (failure && failure.what === what) setBackupFailure(null);
    return;
  }
  setBackupFailure({ at: Date.now(), what, message: err instanceof Error ? err.message : String(err) });
}

export function backupFailure(): BackupFailure | null {
  return failure;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackupFailure(): BackupFailure | null {
  return useSyncExternalStore(subscribe, backupFailure, backupFailure);
}
