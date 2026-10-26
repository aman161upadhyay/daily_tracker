/**
 * Health Connect bridge (Android dev/release builds). Keep this file's exports
 * identical to `healthConnect.ts`. react-native-health-connect resolves its
 * native module when imported, which throws in Expo Go, so it is required
 * lazily behind the support flag — the same pattern as the widget.
 *
 * Read-only: nothing is ever written to Health Connect.
 */
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { BODY_RECORD_TYPES, type BodyBatch, type BodyRecordType, type HeartDay, type HydrationImport, type SleepNight, type StepDay, type WeightEntry, type Workout } from '@/src/domain/body/types';
import { addDays, calendarDayOf, instantOf, trackingDayOf } from '@/src/domain/time/trackingDay';
import type { HealthAccess, HealthConnectStatus, ReadResult, ReadWindow } from './healthConnect';

export type { HealthAccess, HealthConnectStatus, ReadResult, ReadWindow } from './healthConnect';

type Hc = typeof import('react-native-health-connect');

export const HEALTH_CONNECT_SUPPORTED: boolean = Platform.OS === 'android' && !isRunningInExpoGo();

const PROVIDER = 'com.google.android.apps.healthdata';
const PAGE_SIZE = 500;
/** 20 000 records per type and read window; a read that needs more is reported, never silently cut short. */
const MAX_PAGES = 40;

function hc(): Hc {
  return require('react-native-health-connect') as Hc;
}

let initialized: Promise<boolean> | null = null;

/** The SDK must be initialised once per process before any other call. */
function ensureInitialized(): Promise<boolean> {
  if (!initialized) {
    initialized = hc()
      .initialize()
      .catch((err) => {
        initialized = null;
        throw err;
      });
  }
  return initialized;
}

export async function getStatus(): Promise<HealthConnectStatus> {
  if (!HEALTH_CONNECT_SUPPORTED) return 'unsupported';
  const status = await hc().getSdkStatus(PROVIDER);
  const { SdkAvailabilityStatus } = hc();
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update-required';
  return 'not-installed';
}

const RECORD_TYPES = new Set<string>(BODY_RECORD_TYPES);

function toAccess(perms: { accessType: string; recordType: string }[]): HealthAccess {
  const granted = perms.filter((p) => p.accessType === 'read' && RECORD_TYPES.has(p.recordType)).map((p) => p.recordType as BodyRecordType);
  const background = perms.some((p) => p.recordType === 'BackgroundAccessPermission');
  return { granted: [...new Set(granted)], background };
}

/** Show the system permission sheet. Only types declared in the manifest appear on it. */
export async function requestAccess(): Promise<HealthAccess> {
  if (!HEALTH_CONNECT_SUPPORTED) return { granted: [], background: false };
  await ensureInitialized();
  const wanted = [
    ...BODY_RECORD_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })),
    { accessType: 'read' as const, recordType: 'BackgroundAccessPermission' as const },
  ];
  const result = await hc().requestPermission(wanted);
  return toAccess(result);
}

export async function currentAccess(): Promise<HealthAccess> {
  if (!HEALTH_CONNECT_SUPPORTED) return { granted: [], background: false };
  await ensureInitialized();
  return toAccess(await hc().getGrantedPermissions());
}

export async function openSettings(): Promise<void> {
  if (!HEALTH_CONNECT_SUPPORTED) return;
  hc().openHealthConnectSettings();
}

export async function openInstallPage(): Promise<void> {
  const market = `market://details?id=${PROVIDER}&url=healthconnect%3A%2F%2Fonboarding`;
  try {
    await Linking.openURL(market);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${PROVIDER}`);
  }
}

// ── reading ─────────────────────────────────────────────────────────────────

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

async function readAllPages<T extends BodyRecordType>(type: T, startTime: string, endTime: string) {
  const api = hc();
  const records: Awaited<ReturnType<typeof api.readRecords<T>>>['records'] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await api.readRecords(type, { timeRangeFilter: { operator: 'between', startTime, endTime }, pageSize: PAGE_SIZE, ascendingOrder: true, pageToken });
    records.push(...page.records);
    pageToken = page.pageToken;
    if (!pageToken || page.records.length === 0) return records;
  }
  // Merging a truncated read would make the missing records look deleted on the next pass.
  throw new Error(`Too many ${type} records in one read (over ${MAX_PAGES * PAGE_SIZE}); shorten the window and try again.`);
}

function recordId(meta: { id?: string } | undefined, fallback: string): string {
  return meta?.id ?? fallback;
}

export async function readBatch(window: ReadWindow, granted: BodyRecordType[]): Promise<ReadResult> {
  const batch: BodyBatch = {};
  const errors: ReadResult['errors'] = [];
  if (!HEALTH_CONNECT_SUPPORTED || granted.length === 0) return { batch, errors };
  await ensureInitialized();
  const api = hc();
  const { zone, fromDay, toDay, boundaryHour } = window;
  const has = (t: BodyRecordType) => granted.includes(t);
  const ownPackage = Constants.expoConfig?.android?.package;

  // Calendar-day window (steps, heart, weight) and the tracking-day window (workouts, drinks).
  const dayStart = iso(instantOf(fromDay, 0, zone));
  const dayEnd = iso(instantOf(addDays(toDay, 1), 0, zone));
  const trackStart = iso(instantOf(fromDay, boundaryHour * 60, zone));
  const trackEnd = iso(instantOf(addDays(toDay, 1), boundaryHour * 60, zone));
  // Nights that end on `fromDay` started the evening before.
  const sleepStart = iso(instantOf(addDays(fromDay, -1), 12 * 60, zone));

  const attempt = async (type: BodyRecordType, run: () => Promise<void>) => {
    if (!has(type)) return;
    try {
      await run();
    } catch (err) {
      errors.push({ type, message: err instanceof Error ? err.message : String(err) });
    }
  };

  // Health Connect's day buckets start at the filter's start time, so one aggregate gives calendar
  // days (what the Body tab shows, comparable with the source app) and a second, started at the
  // day-boundary hour, gives tracking days (what the Steps habit counts).
  const stepTotals = async (startTime: string, endTime: string): Promise<StepDay[]> => {
    const groups = await api.aggregateGroupByPeriod({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime, endTime },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    });
    const steps: StepDay[] = [];
    for (const g of groups) {
      // Bucket starts are local date-times ("2026-10-26T04:00"); the date part is the day label.
      const day = g.startTime.slice(0, 10);
      if (day < fromDay || day > toDay) continue;
      const origin = g.result.dataOrigins?.[0];
      steps.push({ day, steps: Math.round(g.result.COUNT_TOTAL ?? 0), ...(origin ? { origin } : {}) });
    }
    return steps;
  };
  await attempt('Steps', async () => {
    const steps = await stepTotals(dayStart, dayEnd);
    const habitSteps = boundaryHour === 0 ? steps : await stepTotals(trackStart, trackEnd);
    batch.steps = steps;
    batch.habitSteps = habitSteps;
  });

  await attempt('HeartRate', async () => {
    const groups = await api.aggregateGroupByPeriod({
      recordType: 'HeartRate',
      timeRangeFilter: { operator: 'between', startTime: dayStart, endTime: dayEnd },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    });
    const heart: HeartDay[] = [];
    for (const g of groups) {
      const day = g.startTime.slice(0, 10);
      if (day < fromDay || day > toDay) continue;
      const r = g.result;
      if (!r.MEASUREMENTS_COUNT || !r.BPM_MIN) continue;
      heart.push({ day, minBpm: Math.round(r.BPM_MIN), avgBpm: Math.round(r.BPM_AVG), maxBpm: Math.round(r.BPM_MAX) });
    }
    batch.heart = [...(batch.heart ?? []), ...heart];
    batch.heartSources = { samples: true, resting: batch.heartSources?.resting ?? false };
  });

  await attempt('RestingHeartRate', async () => {
    const records = await readAllPages('RestingHeartRate', dayStart, dayEnd);
    const byDay = new Map<string, { at: number; bpm: number }>();
    for (const r of records) {
      const at = Date.parse(r.time);
      const day = calendarDayOf(at, zone);
      if (day < fromDay || day > toDay || !r.beatsPerMinute) continue;
      const prev = byDay.get(day);
      if (!prev || at > prev.at) byDay.set(day, { at, bpm: Math.round(r.beatsPerMinute) });
    }
    const heart: HeartDay[] = [...byDay].map(([day, v]) => ({ day, restingBpm: v.bpm }));
    batch.heart = [...(batch.heart ?? []), ...heart];
    batch.heartSources = { samples: batch.heartSources?.samples ?? false, resting: true };
  });

  await attempt('SleepSession', async () => {
    const records = await readAllPages('SleepSession', sleepStart, dayEnd);
    const sleep: SleepNight[] = [];
    for (const r of records) {
      const startAt = Date.parse(r.startTime);
      const endAt = Date.parse(r.endTime);
      if (!(endAt > startAt)) continue;
      const day = calendarDayOf(endAt, zone);
      if (day < fromDay || day > toDay) continue;
      const span = Math.round((endAt - startAt) / 60_000);
      const night: SleepNight = { id: recordId(r.metadata, `sleep:${r.startTime}`), startAt, endAt, day, minutes: span };
      if (r.stages && r.stages.length > 0) {
        let awake = 0;
        let light = 0;
        let deep = 0;
        let rem = 0;
        for (const s of r.stages) {
          const m = Math.max(0, (Date.parse(s.endTime) - Date.parse(s.startTime)) / 60_000);
          if (s.stage === 1 || s.stage === 3) awake += m;
          else if (s.stage === 5) deep += m;
          else if (s.stage === 6) rem += m;
          else light += m; // light, unspecified "sleeping" and unknown
        }
        night.awakeMin = Math.round(awake);
        night.lightMin = Math.round(light);
        night.deepMin = Math.round(deep);
        night.remMin = Math.round(rem);
        night.minutes = Math.max(0, span - Math.round(awake));
      }
      const origin = r.metadata?.dataOrigin;
      if (origin) night.origin = origin;
      sleep.push(night);
    }
    batch.sleep = sleep;
  });

  await attempt('ExerciseSession', async () => {
    const records = await readAllPages('ExerciseSession', trackStart, trackEnd);
    const workouts: Workout[] = [];
    for (const r of records) {
      const startAt = Date.parse(r.startTime);
      const endAt = Date.parse(r.endTime);
      const minutes = Math.round((endAt - startAt) / 60_000);
      if (minutes < 1) continue;
      const day = trackingDayOf(startAt, zone, boundaryHour);
      if (day < fromDay || day > toDay) continue;
      const w: Workout = { id: recordId(r.metadata, `exercise:${r.startTime}`), startAt, endAt, day, type: r.exerciseType, minutes, hidden: false };
      if (r.title?.trim()) w.title = r.title.trim();
      const origin = r.metadata?.dataOrigin;
      if (origin) w.origin = origin;
      workouts.push(w);
    }
    batch.workouts = workouts;
  });

  await attempt('Weight', async () => {
    const records = await readAllPages('Weight', dayStart, dayEnd);
    const weight: WeightEntry[] = [];
    for (const r of records) {
      const at = Date.parse(r.time);
      const kg = r.weight?.inKilograms;
      if (!kg || kg <= 0) continue;
      const day = calendarDayOf(at, zone);
      if (day < fromDay || day > toDay) continue;
      const w: WeightEntry = { id: recordId(r.metadata, `weight:${r.time}`), at, day, kg: Math.round(kg * 10) / 10 };
      const origin = r.metadata?.dataOrigin;
      if (origin) w.origin = origin;
      weight.push(w);
    }
    batch.weight = weight;
  });

  await attempt('Hydration', async () => {
    const records = await readAllPages('Hydration', trackStart, trackEnd);
    const hydration: HydrationImport[] = [];
    for (const r of records) {
      const origin = r.metadata?.dataOrigin;
      if (ownPackage && origin === ownPackage) continue;
      const ml = r.volume?.inMilliliters;
      if (!ml || ml <= 0) continue;
      const at = Date.parse(r.startTime);
      hydration.push({ id: recordId(r.metadata, `hydration:${r.startTime}`), at, ml: Math.round(ml), ...(origin ? { origin } : {}) });
    }
    batch.hydration = hydration;
  });

  return { batch, errors };
}
