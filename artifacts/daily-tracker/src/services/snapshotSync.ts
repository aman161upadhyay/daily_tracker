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

/** The running app's store, as far as a snapshot needs it (the LiveStore interface satisfies it). */
export interface SnapshotView {
  /** The newest state (every change, saved or not). */
  current(): TrackerState;
  /** What the database holds. */
  committed(): TrackerState;
  /** True while a whole-state replace (erase, restore, sample data) is on screen but not in the database. */
  replacePending(): boolean;
}

/**
 * What a snapshot of the running app may hold: the state the database has — never a change whose
 * save is pending or gave up — unless the newest intent says there should be none. The person who
 * turned the backup off or erased everything has withdrawn their consent the moment they tapped,
 * whether or not that change has reached the database yet: the committed state may still say
 * "backup on" after the setting's save failed, and the snapshot that the opt-out deleted must not
 * come back from it. A pending replace stands down too: its committed state is about to be
 * replaced wholesale and would sit in the snapshot for the throttle's hour.
 */
export function committedSource(view: SnapshotView): () => TrackerState | null {
  return () => {
    if (view.replacePending()) return null;
    if (!shouldSnapshot(view.current())) return null;
    return view.committed();
  };
}

let queue: Promise<unknown> = Promise.resolve();
/** Write time of the snapshot this process last wrote, or checked and found readable. */
let knownWrittenAt: number | null = null;

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
    // A file this process wrote or already read fine is not parsed again (two years of records
    // cost ~125 ms of main-thread parsing on a phone); one with another write time is unknown.
    if (writtenAt !== null && writtenAt !== knownWrittenAt) await keepUnreadable();
    await writeSnapshot(serializeExport(state));
    knownWrittenAt = await snapshotWrittenAt();
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
    knownWrittenAt = await snapshotWrittenAt();
    return false;
  } catch {
    knownWrittenAt = null;
    return setAsideSnapshot();
  }
}

/** Run `job` after every queued snapshot write (used for delete-after-write ordering). */
export function afterSnapshots<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}
