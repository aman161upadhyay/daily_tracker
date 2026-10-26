import { useEffect, useLayoutEffect, useRef } from 'react';
import { WIDGET_SUPPORTED, refreshWidgets } from '@/src/services/widget';
import { useTracker } from '@/src/state/TrackerProvider';
import { widgetModel, widgetModelKey } from '@/src/widget/model';

/**
 * Keeps the home-screen widget equal to the app: whenever what the widget
 * would show changes (a log, a settings change, the day rolling over), redraw
 * it, debounced. Renders nothing; a no-op on web, iOS and in Expo Go.
 */
export function WidgetSync() {
  const { state, ready, today, nowMs, zone } = useTracker();
  const latest = useRef({ state, today, nowMs, zone });
  // Committed values only (a render-phase ref write makes the compiler skip the component); the
  // timer below fires long after commit.
  useLayoutEffect(() => {
    latest.current = { state, today, nowMs, zone };
  });

  const key = ready && WIDGET_SUPPORTED ? widgetModelKey(widgetModel(state, today, nowMs, zone)) : '';

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      const { state: s, today: d, nowMs: t, zone: z } = latest.current;
      refreshWidgets(s, d, t, z).catch((err) => console.warn('Widget refresh failed', err));
    }, 400);
    return () => clearTimeout(timer);
  }, [key]);

  return null;
}
