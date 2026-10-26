/**
 * Read models for the Body tab, computed from the Health Connect mirrors.
 * Pure: days in, numbers out.
 */
import { addDays, lastNDays, minutesOfDay, weekStartOf } from '@/src/domain/time/trackingDay';
import { isWalk } from './exerciseTypes';
import type { BodyState, HeartDay, SleepNight, Workout } from './types';

export type BodyMetric = 'steps' | 'sleep' | 'heart' | 'weight' | 'workouts';

export const BODY_METRICS: BodyMetric[] = ['steps', 'sleep', 'heart', 'weight', 'workouts'];

/** Workouts worth counting: visible, not a walk (walks are movement snacks' territory), at least 10 minutes. */
export function countedWorkouts(body: BodyState): Workout[] {
  return body.workouts.filter((w) => !w.hidden && !isWalk(w.type) && w.minutes >= 10);
}

export function stepsByDay(body: BodyState): Map<string, number> {
  return new Map(body.steps.map((s) => [s.day, s.steps]));
}

/** Minutes asleep per wake-up day (several sessions on one day add up: a night plus a nap). */
export function sleepByDay(body: BodyState): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of body.sleep) m.set(s.day, (m.get(s.day) ?? 0) + s.minutes);
  return m;
}

export function heartByDay(body: BodyState): Map<string, HeartDay> {
  return new Map(body.heart.map((h) => [h.day, h]));
}

/** Resting bpm when the source reports it, else the day's minimum (a fair proxy for most phones/watches). */
export function restingOf(h: HeartDay | undefined): number | undefined {
  return h?.restingBpm ?? h?.minBpm;
}

/** Latest weight per calendar day. */
export function weightByDay(body: BodyState): Map<string, number> {
  const m = new Map<string, number>();
  const sorted = [...body.weight].sort((a, b) => a.at - b.at);
  for (const w of sorted) m.set(w.day, w.kg);
  return m;
}

export function workoutMinutesByDay(body: BodyState): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of countedWorkouts(body)) m.set(w.day, (m.get(w.day) ?? 0) + w.minutes);
  return m;
}

/** Values for a run of days (0 where nothing was recorded). */
export function seriesOf(map: Map<string, number>, days: string[]): number[] {
  return days.map((d) => map.get(d) ?? 0);
}

/** Average of the non-zero values, or undefined when there are none. */
export function averageOf(values: number[]): number | undefined {
  const xs = values.filter((v) => v > 0);
  if (xs.length === 0) return undefined;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** The main sleep session that ended on `day` (the longest one), if any. */
export function nightEndingOn(body: BodyState, day: string): SleepNight | undefined {
  let best: SleepNight | undefined;
  for (const s of body.sleep) if (s.day === day && (!best || s.minutes > best.minutes)) best = s;
  return best;
}

/** Last night: the night that ended today, else yesterday's (flagged), else nothing. */
export function lastNight(body: BodyState, calendarToday: string): { night: SleepNight; day: string; isToday: boolean } | undefined {
  const today = nightEndingOn(body, calendarToday);
  if (today) return { night: today, day: calendarToday, isToday: true };
  const y = addDays(calendarToday, -1);
  const yesterday = nightEndingOn(body, y);
  return yesterday ? { night: yesterday, day: y, isToday: false } : undefined;
}

/**
 * Sleep regularity: how much bedtime moves night to night, as the standard
 * deviation of the bedtime minute over the last `nights` main sessions.
 * Under 30 min is regular; over 60 min is irregular. Needs three nights.
 */
export function bedtimeSpreadMin(body: BodyState, calendarToday: string, zone: string, nights = 7): number | undefined {
  const bedtimes: number[] = [];
  for (const day of lastNDays(calendarToday, nights)) {
    const n = nightEndingOn(body, day);
    if (!n) continue;
    // Minutes after 18:00 so that 23:30 and 00:30 sit next to each other.
    const m = (minutesOfDay(n.startAt, zone) - 18 * 60 + 24 * 60) % (24 * 60);
    bedtimes.push(m);
  }
  if (bedtimes.length < 3) return undefined;
  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance = bedtimes.reduce((a, b) => a + (b - mean) ** 2, 0) / bedtimes.length;
  return Math.round(Math.sqrt(variance));
}

export function latestWeight(body: BodyState): { kg: number; day: string; delta30?: number } | undefined {
  if (body.weight.length === 0) return undefined;
  const sorted = [...body.weight].sort((a, b) => a.at - b.at);
  const last = sorted[sorted.length - 1]!;
  const cutoff = addDays(last.day, -30);
  const earlier = sorted.filter((w) => w.day <= cutoff);
  const ref = earlier[earlier.length - 1];
  return { kg: last.kg, day: last.day, ...(ref ? { delta30: last.kg - ref.kg } : {}) };
}

export function latestResting(body: BodyState): { bpm: number; day: string } | undefined {
  const days = [...body.heart].sort((a, b) => (a.day < b.day ? -1 : 1));
  for (let i = days.length - 1; i >= 0; i--) {
    const bpm = restingOf(days[i]);
    if (bpm !== undefined) return { bpm, day: days[i]!.day };
  }
  return undefined;
}

/** Workouts in the week containing `day` (Monday start), newest first. */
export function workoutsThisWeek(body: BodyState, day: string): Workout[] {
  const start = weekStartOf(day);
  const end = addDays(start, 7);
  return countedWorkouts(body)
    .filter((w) => w.day >= start && w.day < end)
    .sort((a, b) => b.startAt - a.startAt);
}

/** Weekly buckets for the 6M / Y charts: `sum` for counts, `avg` for levels (ignoring empty days). */
export function bucketWeekly(values: number[], mode: 'sum' | 'avg'): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 7) {
    const slice = values.slice(i, i + 7);
    if (mode === 'sum') out.push(slice.reduce((a, b) => a + b, 0));
    else out.push(Math.round((averageOf(slice) ?? 0) * 10) / 10);
  }
  return out;
}

export function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Friendly name for a Health Connect data origin (package name). */
export function originName(pkg: string | undefined): string | undefined {
  if (!pkg) return undefined;
  const known: Record<string, string> = {
    'com.sec.android.app.shealth': 'Samsung Health',
    'com.google.android.apps.fitness': 'Google Fit',
    'com.fitbit.FitbitMobile': 'Fitbit',
    'com.google.android.apps.healthdata': 'Health Connect',
    'com.garmin.android.apps.connectmobile': 'Garmin Connect',
    'com.huawei.health': 'Huawei Health',
    'com.xiaomi.wearable': 'Mi Fitness',
    'com.withings.wiscale2': 'Withings',
    'com.oura': 'Oura',
    'com.whoop.android': 'WHOOP',
    'com.polar.polarflow': 'Polar Flow',
    'com.strava': 'Strava',
  };
  return known[pkg] ?? pkg.split('.').pop();
}
