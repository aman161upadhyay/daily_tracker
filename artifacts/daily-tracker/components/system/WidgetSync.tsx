import { useEffect, useLayoutEffect, useRef } from 'react';
import { WIDGET_SUPPORTED, refreshWidgets } from '@/src/services/widget';
import { useTracker } from '@/src/state/TrackerProvider';
import { widgetModel, widgetModelKey } from '@/src/widget/model';

/**
 * Keeps the home-screen widget equal to the app: whenever what the widget
 * would show changes (a log, a settings change, the day rolling over), redraw
 * it, debounced. Renders nothing; a no-op on web, iOS and in Expo Go.
 *
 * While a save has failed (the app shows "Could not save your last change"), the widget draws
 * what is on disk, not the unsaved change: a drink the database refused must not be confirmed on
 * the home screen and then vanish with the process. When the retry lands the live state is drawn.
 */
export function WidgetSync() {
  const { state, ready, today, nowMs, zone, storageError, committed } = useTracker();
  const saveFailed = !!storageError && storageError.startsWith('Could not save');
  const shown = saveFailed ? committed() : state;
  const latest = useRef({ shown, today, nowMs, zone });
  // Committed values only (a render-phase ref write makes the compiler skip the component); the
  // timer below fires long after commit.
  useLayoutEffect(() => {
    latest.current = { shown, today, nowMs, zone };
  });

  const key = ready && WIDGET_SUPPORTED ? widgetModelKey(widgetModel(shown, today, nowMs, zone)) : '';

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      const { shown: s, today: d, nowMs: t, zone: z } = latest.current;
      refreshWidgets(s, d, t, z).catch((err) => console.warn('Widget refresh failed', err));
    }, 400);
    return () => clearTimeout(timer);
  }, [key]);

  return null;
}
