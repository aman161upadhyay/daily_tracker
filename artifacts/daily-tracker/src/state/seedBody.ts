/**
 * Sample Health Connect data for the demo dataset: a phone that counts steps,
 * a watch that records sleep and heart rate, a scale every few days, and a
 * gym habit. Deterministic given the caller's PRNG.
 */
import type { BodyState, HeartDay, SleepNight, StepDay, WeightEntry, Workout } from '@/src/domain/body/types';
import type { HabitEntry } from '@/src/domain/models';
import { addDays, weekdayOf } from '@/src/domain/time/trackingDay';

const SAMSUNG = 'com.sec.android.app.shealth';

export interface SampleBodyInput {
  today: string;
  zone: string;
  nowMs: number;
  nowMin: number;
  days: number;
  rand: () => number;
  /** (day, minute of day) → epoch ms, same helper the rest of the sample data uses. */
  at: (day: string, minute: number) => number;
  nextId: (prefix: string) => string;
}

export function buildSampleBody(input: SampleBodyInput, stepsHabitId: string | undefined): { body: BodyState; entries: HabitEntry[] } {
  const { today, zone, nowMs, nowMin, days, rand, at, nextId } = input;
  const steps: StepDay[] = [];
  const sleep: SleepNight[] = [];
  const heart: HeartDay[] = [];
  const weight: WeightEntry[] = [];
  const workouts: Workout[] = [];
  const entries: HabitEntry[] = [];

  let kg = 76.4;
  for (let k = days - 1; k >= 0; k--) {
    const day = addDays(today, -k);
    const isToday = k === 0;
    const wd = weekdayOf(day); // Monday = 0
    const weekend = wd >= 5;
    const f = (days - 1 - k) / (days - 1);

    // Steps: weekdays cluster around 7k, weekends swing wider; a slow upward trend.
    let total = Math.round((weekend ? 4200 + rand() * 6800 : 5600 + rand() * 3600) * (0.9 + 0.2 * f));
    if (isToday) total = Math.round(total * Math.min(1, Math.max(0.05, (nowMin - 7 * 60) / (15 * 60))));
    steps.push({ day, steps: total, origin: SAMSUNG });
    if (stepsHabitId) {
      entries.push({ id: nextId('e'), habitId: stepsHabitId, day, at: isToday ? nowMs : at(day, 23 * 60 + 50), zone, value: total, source: 'AUTO_HC' });
    }

    // Sleep: bed 22:50–00:40 the evening before, wake 6:40–7:50; weekends later.
    const bedMin = 22 * 60 + 50 + Math.floor(rand() * 110) + (weekend ? 30 : 0);
    const wakeMin = 6 * 60 + 40 + Math.floor(rand() * 70) + (weekend ? 45 : 0);
    const startAt = at(addDays(day, -1), bedMin);
    const endAt = at(day, wakeMin);
    const span = Math.round((endAt - startAt) / 60_000);
    const awake = 10 + Math.floor(rand() * 25);
    const asleep = span - awake;
    const deep = Math.round(asleep * (0.16 + rand() * 0.06));
    const rem = Math.round(asleep * (0.2 + rand() * 0.06));
    sleep.push({ id: nextId('sl'), startAt, endAt, day, minutes: asleep, deepMin: deep, remMin: rem, lightMin: asleep - deep - rem, awakeMin: awake, origin: SAMSUNG });

    // Resting heart rate drifts down a little over the period.
    const resting = Math.round(63 - 4 * f + (rand() - 0.5) * 4);
    heart.push({ day, restingBpm: resting, minBpm: resting - 2 - Math.floor(rand() * 3), avgBpm: resting + 12 + Math.floor(rand() * 6), maxBpm: resting + 55 + Math.floor(rand() * 40) });

    // Scale every three days or so.
    if (k % 3 === 0 || isToday) {
      kg += (rand() - 0.55) * 0.35;
      weight.push({ id: nextId('wt'), at: at(day, 7 * 60 + 5), day, kg: Math.round(kg * 10) / 10, origin: 'com.withings.wiscale2' });
    }

    // Gym Tuesday and Thursday evenings (mostly), a run on Saturday, a long walk now and then.
    if ((wd === 1 || wd === 3) && rand() < 0.8 && !(isToday && nowMin < 19 * 60)) {
      const minutes = 38 + Math.floor(rand() * 18);
      const start = at(day, 18 * 60 + 10 + Math.floor(rand() * 20));
      workouts.push({ id: nextId('wo'), startAt: start, endAt: start + minutes * 60_000, day, type: 70, title: 'Strength training', minutes, origin: SAMSUNG, hidden: false });
    }
    if (wd === 5 && rand() < 0.7 && !(isToday && nowMin < 10 * 60)) {
      const minutes = 26 + Math.floor(rand() * 12);
      const start = at(day, 8 * 60 + 30 + Math.floor(rand() * 40));
      workouts.push({ id: nextId('wo'), startAt: start, endAt: start + minutes * 60_000, day, type: 56, minutes, origin: SAMSUNG, hidden: false });
    }
    if (wd === 6 && rand() < 0.5 && !isToday) {
      const minutes = 45 + Math.floor(rand() * 30);
      const start = at(day, 16 * 60);
      workouts.push({ id: nextId('wo'), startAt: start, endAt: start + minutes * 60_000, day, type: 79, minutes, origin: SAMSUNG, hidden: false });
    }
  }

  return {
    body: {
      steps,
      sleep,
      heart,
      weight,
      workouts,
      sync: { lastSyncAt: nowMs, granted: ['Steps', 'SleepSession', 'ExerciseSession', 'HeartRate', 'RestingHeartRate', 'Weight', 'Hydration'], background: true },
    },
    entries,
  };
}
