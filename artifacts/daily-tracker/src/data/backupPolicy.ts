import type { TrackerState } from '@/src/state/types';

/**
 * Anything the user would miss. The seeded Water habit alone (what "Erase
 * everything" leaves behind) does not count, so erasing deletes the snapshot.
 */
export function hasUserData(s: TrackerState): boolean {
  return (
    s.entries.length > 0 ||
    s.water.length > 0 ||
    s.snacks.length > 0 ||
    s.mind.length > 0 ||
    s.cycleLogs.length > 0 ||
    s.settings.cycle.history.length > 0 ||
    s.body.steps.length > 0 ||
    s.body.sleep.length > 0 ||
    s.body.weight.length > 0 ||
    s.body.workouts.length > 0 ||
    s.habits.some((h) => h.presetId !== 'water')
  );
}

/** Whether the current state should be on disk for Android to back up. */
export function shouldSnapshot(s: TrackerState): boolean {
  return s.settings.onboardingDone && s.settings.cloudBackup && !s.settings.sampleData && hasUserData(s);
}
