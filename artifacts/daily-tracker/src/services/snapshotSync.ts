/**
 * The one place that decides whether to refresh the Auto Backup snapshot.
 * Shared by the in-app BackupSync (start, foreground/background) and the
 * headless writers (widget tap, notification button, background re-plan), so a
 * phone that is only ever used from the widget still gets a fresh snapshot.
 *
 * Policy (src/data/backupPolicy.ts): onboarding done, backup on, not sample
 * data, something worth keeping. Throttle: at most one write per hour, Auto
 * Backup itself runs about daily.
 */
import { serializeExport } from '@/src/data/transfer';
import { shouldSnapshot } from '@/src/data/backupPolicy';
import type { TrackerState } from '@/src/state/types';
import { snapshotWrittenAt, writeSnapshot } from './backup';

/** A snapshot at most this often. */
export const SNAPSHOT_MIN_AGE_MS = 60 * 60 * 1000;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Write a snapshot when the policy says so and the last one is old enough.
 * Writes are queued so two callers never interleave on the file. Pass a getter
 * from the running app so the state is read when the job runs, not when it was
 * queued: a job queued before "Erase everything" then sees the erased state and
 * writes nothing, instead of putting the old data back after the delete.
 * Resolves true when a snapshot was written.
 */
export function maybeSnapshot(source: TrackerState | (() => TrackerState), nowMs = Date.now()): Promise<boolean> {
  const job = async (): Promise<boolean> => {
    const state = typeof source === 'function' ? source() : source;
    if (!shouldSnapshot(state)) return false;
    const writtenAt = await snapshotWrittenAt();
    if (writtenAt !== null && nowMs - writtenAt < SNAPSHOT_MIN_AGE_MS) return false;
    await writeSnapshot(serializeExport(state));
    return true;
  };
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Run `job` after every queued snapshot write (used for delete-after-write ordering). */
export function afterSnapshots<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}
