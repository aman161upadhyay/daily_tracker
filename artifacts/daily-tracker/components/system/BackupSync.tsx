import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { serializeExport } from '@/src/data/transfer';
import { deleteSnapshot, snapshotWrittenAt, writeSnapshot } from '@/src/services/backup';
import { useTracker } from '@/src/state/TrackerProvider';
import type { TrackerState } from '@/src/state/types';

/** A snapshot at most this often; Auto Backup itself runs about once a day. */
const MIN_AGE_MS = 60 * 60 * 1000;

const isEmpty = (s: TrackerState) => s.habits.length === 0 && s.entries.length === 0 && s.water.length === 0 && s.snacks.length === 0 && s.mind.length === 0;

/**
 * Keeps `files/backup/snapshot.json` fresh for Android Auto Backup: written on
 * start and on every foreground/background change when the state moved and the
 * last snapshot is over an hour old. Sample data is never snapshotted, and
 * erasing everything removes the snapshot too ("deleted" must mean deleted).
 */
export function BackupSync() {
  const { state, ready } = useTracker();
  const latest = useRef(state);
  latest.current = state;
  const lastWritten = useRef<TrackerState | null>(null);
  const wasEmpty = useRef<boolean | null>(null);

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const attempt = async () => {
      const s = latest.current;
      if (s.settings.sampleData || isEmpty(s) || lastWritten.current === s) return;
      const writtenAt = await snapshotWrittenAt();
      if (writtenAt !== null && Date.now() - writtenAt < MIN_AGE_MS) return;
      await writeSnapshot(serializeExport(s));
      lastWritten.current = s;
    };
    const run = () => attempt().catch((err) => console.warn('[backup] snapshot failed', err));
    run();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'active') run();
    });
    return () => sub.remove();
  }, [ready]);

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const empty = isEmpty(state);
    if (wasEmpty.current === false && empty) {
      lastWritten.current = null;
      deleteSnapshot().catch((err) => console.warn('[backup] delete failed', err));
    }
    wasEmpty.current = empty;
  }, [ready, state]);

  return null;
}
