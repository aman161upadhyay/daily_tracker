import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { autoSyncDue, useHealthConnect } from '@/hooks/useHealthConnect';
import { useTracker } from '@/src/state/TrackerProvider';

/**
 * Pulls Health Connect when the app opens or returns to the foreground, if
 * the user connected it. Renders nothing; a no-op on web, iOS and in Expo Go.
 * The data lands through the same reducer actions as a manual "Sync now".
 */
export function BodySync() {
  const { ready } = useTracker();
  const hc = useHealthConnect();
  const latest = useRef(hc);
  latest.current = hc;

  const shouldRun = ready && hc.supported && hc.enabled;

  useEffect(() => {
    if (!shouldRun) return;
    let alive = true;
    // One pending read at a time: a foreground event while one is waiting restarts the wait rather
    // than queueing a second; the cleanup cancels whichever is pending, so a retired instance (an
    // error-boundary reset) never starts a read that would land in a dead provider and hold the
    // shared in-flight slot against its replacement.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      timer = null;
      if (!alive) return;
      const h = latest.current;
      if (!h.enabled || !autoSyncDue()) return;
      h.syncNow().catch((err) => console.warn('Health Connect auto-sync failed', err));
    };
    // Give the provider a moment to reload anything a background task wrote while we slept.
    const later = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(run, 1500);
    };
    later();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') later();
    });
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
      sub.remove();
    };
  }, [shouldRun]);

  return null;
}
