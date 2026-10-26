import { useMemo } from 'react';
import type { Habit } from '@/src/domain/models';
import { activeHabits, habitView, highlights, liveNudge, todaySummary, type HabitView } from './selectors';
import { useTracker } from './TrackerProvider';

export function useTodaySummary() {
  const { state, today, nowMs, zone } = useTracker();
  return useMemo(() => todaySummary(state, today, nowMs, zone), [state, today, nowMs, zone]);
}

export function useLiveNudge() {
  const { state, today, nowMs, zone } = useTracker();
  return useMemo(() => liveNudge(state, today, nowMs, zone), [state, today, nowMs, zone]);
}

/** Active habits for the Today list: pinned ones first, otherwise in library order. */
export function useHabitViews(): HabitView[] {
  const { state, today } = useTracker();
  return useMemo(() => {
    const active = activeHabits(state);
    const ordered = [...active.filter((h) => h.pinned), ...active.filter((h) => !h.pinned)];
    return ordered.map((h) => habitView(state, h, today));
  }, [state, today]);
}

export function useHabitView(habit: Habit | undefined): HabitView | undefined {
  const { state, today } = useTracker();
  return useMemo(() => (habit ? habitView(state, habit, today) : undefined), [state, today, habit]);
}

export function useHighlights() {
  const { state, today } = useTracker();
  return useMemo(() => highlights(state, today), [state, today]);
}
