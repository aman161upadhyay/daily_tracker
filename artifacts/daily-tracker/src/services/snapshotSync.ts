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
import { inspectExport, serializeExport } from '@/src/data/transfer';
import { shouldSnapshot } from '@/src/data/backupPolicy';
import type { TrackerState } from '@/src/state/types';
import { readSnapshot, setAsideSnapshot, snapshotWrittenAt, writeSnapshot } from './backup';

/** A snapshot at most this often. */
export const SNAPSHOT_MIN_AGE_MS = 60 * 60 * 1000;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Write a snapshot when the policy says so and the last one is old enough.
 * Writes are queued so two callers never interleave on the file. The state is
 * read from the getter when the job runs, not when it was queued: a job queued
 * before "Erase everything" then sees the erased state and writes nothing,
 * instead of putting the old data back after the delete. A getter that returns
 * null stands down (a headless writer that found the app alive by the time its
 * turn came leaves the snapshot to the app). Resolves true when a snapshot was
 * written.
 */
export function maybeSnapshot(source: () => TrackerState | null, nowMs = Date.now()): Promise<boolean> {
  const job = async (): Promise<boolean> => {
    const state = source();
    if (!state || !shouldSnapshot(state)) return false;
    const writtenAt = await snapshotWrittenAt();
    if (writtenAt !== null && nowMs - writtenAt < SNAPSHOT_MIN_AGE_MS) return false;
    if (writtenAt !== null) await keepUnreadable();
    await writeSnapshot(serializeExport(state));
    return true;
  };
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * A snapshot on disk this build cannot read — restored from a phone running a newer app, or
 * damaged — is moved aside rather than overwritten: it may be the only copy of that data, and a
 * later update can still restore it (Settings offers it). Nothing to do when it reads fine.
 */
export async function keepUnreadable(): Promise<boolean> {
  const existing = await readSnapshot();
  if (!existing) return false;
  try {
    inspectExport(existing.text);
    return false;
  } catch {
    return setAsideSnapshot();
  }
}

/** Run `job` after every queued snapshot write (used for delete-after-write ordering). */
export function afterSnapshots<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}
