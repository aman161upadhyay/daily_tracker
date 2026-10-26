/**
 * Health Connect mirrors. Everything here is a copy of what another app
 * measured (phone, watch, Samsung Health…), keyed so that re-reading the same
 * days is idempotent. Days are calendar days for steps / heart / weight (the
 * numbers people compare with the source app), the wake-up calendar day for
 * sleep, and the tracking day for workouts and hydration (they feed habits).
 */

export interface StepDay {
  /** Calendar day (local). */
  day: string;
  steps: number;
  /** Package name of the app that counted, when known. */
  origin?: string;
}

export interface SleepNight {
  /** Health Connect record id. */
  id: string;
  startAt: number;
  endAt: number;
  /** Calendar day the session ended on (the morning after). */
  day: string;
  /** Time asleep in minutes: the session minus awake stages when stages exist. */
  minutes: number;
  deepMin?: number;
  remMin?: number;
  lightMin?: number;
  awakeMin?: number;
  origin?: string;
}

export interface HeartDay {
  /** Calendar day (local). */
  day: string;
  restingBpm?: number;
  minBpm?: number;
  avgBpm?: number;
  maxBpm?: number;
}

export interface WeightEntry {
  /** Health Connect record id. */
  id: string;
  at: number;
  /** Calendar day (local). */
  day: string;
  kg: number;
  origin?: string;
}

export interface Workout {
  /** Health Connect record id. */
  id: string;
  startAt: number;
  endAt: number;
  /** Tracking day of the start. */
  day: string;
  /** Health Connect exercise type constant (see `exerciseTypes.ts`). */
  type: number;
  title?: string;
  minutes: number;
  origin?: string;
  /** Hidden by the user; kept so the next sync does not bring it back. */
  hidden: boolean;
}

/** A water record from another app, before it becomes a `WaterEntry`. */
export interface HydrationImport {
  /** Health Connect record id → `WaterEntry.externalId`. */
  id: string;
  at: number;
  ml: number;
  origin?: string;
}

/** One read from Health Connect; every list is optional so partial reads merge cleanly. */
export interface BodyBatch {
  steps?: StepDay[];
  /**
   * Steps per *tracking* day (the day boundary the habits use), for the Steps habit. Equals
   * `steps` when the boundary is midnight; absent when the read failed.
   */
  habitSteps?: StepDay[];
  sleep?: SleepNight[];
  heart?: HeartDay[];
  weight?: WeightEntry[];
  workouts?: Workout[];
  hydration?: HydrationImport[];
  /**
   * The days this read covered, set only when every requested type was read in full. With it,
   * a row inside the window that the read did not return was deleted upstream and is dropped
   * here too (mirrors, strength ticks, imported drinks). Without it nothing is removed.
   */
  window?: { fromDay: string; toDay: string };
}

export interface BodySync {
  /** Epoch ms of the last successful read. */
  lastSyncAt?: number;
  /** Last failure, shown on the Body tab until the next success. */
  lastError?: string;
  /** Record types Health Connect granted last time we asked. */
  granted: BodyRecordType[];
  /** Whether background reads were granted. */
  background: boolean;
}

export interface BodyState {
  steps: StepDay[];
  sleep: SleepNight[];
  heart: HeartDay[];
  weight: WeightEntry[];
  workouts: Workout[];
  sync: BodySync;
}

export const EMPTY_BODY: BodyState = {
  steps: [],
  sleep: [],
  heart: [],
  weight: [],
  workouts: [],
  sync: { granted: [], background: false },
};

/** Record types we ask Health Connect for (the manifest declares the matching permissions). */
export const BODY_RECORD_TYPES = ['Steps', 'SleepSession', 'ExerciseSession', 'HeartRate', 'RestingHeartRate', 'Weight', 'Hydration'] as const;
export type BodyRecordType = (typeof BODY_RECORD_TYPES)[number];
