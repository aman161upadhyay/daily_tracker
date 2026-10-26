import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { cleanupPending, deleteKeptSnapshots, deleteSnapshot, markCleanupPending } from '@/src/services/backup';
import { afterSnapshots, committedSource, maybeSnapshot } from '@/src/services/snapshotSync';
import { liveStore } from '@/src/state/liveStore';
import { purgeTransferCache } from '@/src/services/transferCache';
import { useTracker } from '@/src/state/TrackerProvider';
import { hasUserData } from '@/src/data/backupPolicy';
import type { TrackerState } from '@/src/state/types';

export { hasUserData, shouldSnapshot } from '@/src/data/backupPolicy';

/**
 * Keeps `files/backup/snapshot.json` fresh for Android Auto Backup: written on
 * start and on every foreground/background change when the state moved and the
 * last snapshot is over an hour old.
 *
 * Rules that matter for trust:
 * - nothing is written before onboarding finished, so a snapshot restored by
 *   Android onto a new phone survives until the user chose "Restore" or
 *   "Start fresh" (the welcome screen offers it)
 * - sample data is never snapshotted, and loading it never deletes the last
 *   real snapshot (it may be the only copy left)
 * - "Erase everything" and turning the setting off delete the snapshot
 *   ("deleted" must mean deleted), queued behind any write in flight; the
 *   intent is recorded on disk first, so an app killed before the delete ran
 *   finishes it on the next start instead of leaving the copy behind
 */
export function BackupSync() {
  const { state, ready, commitPending } = useTracker();
  const lastWritten = useRef<TrackerState | null>(null);
  const enqueue = (job: () => Promise<void>) => {
    afterSnapshots(job).catch((err) => console.warn('[backup]', err));
  };

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    // maybeSnapshot queues itself; never wrap it in `enqueue` (that would wait on its own queue).
    // It reads the state when its turn comes, so a write queued before an erase sees the erase.
    // Only what the database holds goes into a snapshot: the rendered state may carry a change
    // whose save is still in flight (or gave up), and a backup must not hold a drink the app's
    // own store does not. The wait ends either way (the write, or the save giving up).
    const run = () => {
      commitPending()
        .then(() => {
          // The newest intent is read when the job runs (committedSource): an opt-out or erase
          // whose save is pending or failed vetoes a snapshot of the committed state, which may
          // still say "backup on" — the copy the opt-out deleted must not come back from it.
          const live = liveStore();
          if (!live || lastWritten.current === live.committed()) return;
          const source = committedSource(live);
          let used: TrackerState | null = null;
          return maybeSnapshot(() => (used = source())).then((written) => {
            if (written) lastWritten.current = used;
          });
        })
        .catch((err) => console.warn('[backup]', err));
    };
    cleanupPending()
      .then((pending) => {
        if (pending === 'all') enqueue(deleteSnapshot);
        else if (pending === 'kept') enqueue(deleteKeptSnapshots);
      })
      .catch((err) => console.warn('[backup]', err));
    run();
    enqueue(() => purgeTransferCache());
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'active') run();
    });
    return () => sub.remove();
  }, [ready]);

  // Erase, or the setting turned off → delete (after any in-flight write).
  const previous = useRef<{ data: boolean; enabled: boolean } | null>(null);
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const current = { data: hasUserData(state), enabled: state.settings.cloudBackup };
    const prev = previous.current;
    previous.current = current;
    if (!prev) return;
    const erased = prev.data && !current.data;
    const turnedOff = prev.enabled && !current.enabled;
    if (erased || turnedOff) {
      lastWritten.current = null;
      markCleanupPending()
        .catch((err) => console.warn('[backup]', err))
        .then(() => enqueue(deleteSnapshot));
      if (erased) enqueue(() => purgeTransferCache({ all: true }));
    }
  }, [ready, state]);

  return null;
}
