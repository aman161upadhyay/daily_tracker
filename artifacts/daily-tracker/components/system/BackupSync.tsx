import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { cleanupPending, deleteSnapshot, markCleanupPending } from '@/src/services/backup';
import { afterSnapshots, maybeSnapshot } from '@/src/services/snapshotSync';
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
  const { state, ready } = useTracker();
  const latest = useRef(state);
  latest.current = state;
  const lastWritten = useRef<TrackerState | null>(null);
  const enqueue = (job: () => Promise<void>) => {
    afterSnapshots(job).catch((err) => console.warn('[backup]', err));
  };

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    // maybeSnapshot queues itself; never wrap it in `enqueue` (that would wait on its own queue).
    // It reads the state when its turn comes, so a write queued before an erase sees the erase.
    const run = () => {
      if (lastWritten.current === latest.current) return;
      let used: TrackerState | null = null;
      maybeSnapshot(() => (used = latest.current))
        .then((written) => {
          if (written) lastWritten.current = used;
        })
        .catch((err) => console.warn('[backup]', err));
    };
    cleanupPending()
      .then((pending) => {
        if (pending) enqueue(deleteSnapshot);
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
