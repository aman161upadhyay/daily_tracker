import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { serializeExport } from '@/src/data/transfer';
import { deleteSnapshot, snapshotWrittenAt, writeSnapshot } from '@/src/services/backup';
import { purgeTransferCache } from '@/src/services/transferCache';
import { useTracker } from '@/src/state/TrackerProvider';
import { hasUserData, shouldSnapshot } from '@/src/data/backupPolicy';
import type { TrackerState } from '@/src/state/types';

export { hasUserData, shouldSnapshot } from '@/src/data/backupPolicy';

/** A snapshot at most this often; Auto Backup itself runs about once a day. */
const MIN_AGE_MS = 60 * 60 * 1000;

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
 *   ("deleted" must mean deleted), queued behind any write in flight
 */
export function BackupSync() {
  const { state, ready } = useTracker();
  const latest = useRef(state);
  latest.current = state;
  const lastWritten = useRef<TrackerState | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (job: () => Promise<void>) => {
    queue.current = queue.current.then(job).catch((err) => console.warn('[backup]', err));
  };

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const attempt = async () => {
      const s = latest.current;
      if (!shouldSnapshot(s) || lastWritten.current === s) return;
      const writtenAt = await snapshotWrittenAt();
      if (writtenAt !== null && Date.now() - writtenAt < MIN_AGE_MS) return;
      await writeSnapshot(serializeExport(s));
      lastWritten.current = s;
    };
    const run = () => enqueue(attempt);
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
      enqueue(deleteSnapshot);
      if (erased) enqueue(() => purgeTransferCache({ all: true }));
    }
  }, [ready, state]);

  return null;
}
