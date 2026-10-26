/**
 * Persistence boundary. The reducer stays pure; a store receives consecutive
 * states and writes whatever changed between them.
 *
 * Native uses row-level SQLite (`sql/sqliteStore.ts`) so that future headless
 * writers (notification actions, the widget) can add a single row without
 * clobbering a whole-state blob. Web and tests use a JSON blob
 * (`jsonStore.ts`) because expo-sqlite on web needs wasm + COOP/COEP headers.
 */
import { normalizeBody } from '@/src/domain/body/merge';
import { DEFAULT_SETTINGS, type CycleDayLog, type Settings } from '@/src/domain/models';
import { isCalendarDay } from '@/src/domain/time/trackingDay';
import type { TrackerState } from '@/src/state/types';
import { projectRecords, sanitizeCycleReminders, sanitizePeriodHistory, sanitizeSettings, validateRecords, ValidationError } from './validate';

/** A service record as read: its text (null when absent) and the opaque version a write compares against. */
export interface RecordRead {
  value: string | null;
  version: string;
}

/** The version of a record: the replace generation it was read under, then the text (absent: "-"). */
export function recordVersion(generation: number, value: string | null): string {
  return value === null ? `${generation}:-` : `${generation}:+${value}`;
}

export interface TrackerStore {
  /** Saved state, or null on a fresh install. */
  load(): Promise<TrackerState | null>;
  /** Write the difference between two consecutive states. */
  persist(prev: TrackerState, next: TrackerState): Promise<void>;
  /**
   * Write a whole state, replacing everything saved (first run, import, erase, sample data) —
   * the service records included: what the old state's alarms delivered dies with the old state.
   */
  replace(state: TrackerState): Promise<void>;
  /**
   * A service record kept beside the state (the notification service's bookkeeping, the inbox of
   * button presses): it shares the state's database, so it is as durable as the state and is
   * replaced with it. The value is null when there is none; the version is the token for the
   * compare-and-set write that follows. A replace() moves the version of every record, present or
   * not — a writer that read "no record yet" before a replace is refused after it.
   */
  readRecord(key: string): Promise<RecordRead>;
  /**
   * Write a service record only if its version is still `expected`; the new version, or null when
   * another writer (or a replace) moved it first, so the caller can read again instead of
   * overwriting. A null `value` removes the record.
   */
  writeRecord(key: string, value: string | null, expected: string): Promise<string | null>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** The data version this build writes; files from a newer version are refused (see parseState). */
export const DATA_VERSION = 1;

/**
 * Fill in settings added after a state was saved, so new fields get defaults.
 * Unknown keys and wrongly-typed values are dropped (a hand-edited or newer
 * file never carries junk into the state or the database).
 */
export function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const base = sanitizeSettings(raw);
  const cycle: Partial<Settings['cycle']> = base.cycle ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...base,
    pinned: Array.isArray(base.pinned) ? base.pinned : DEFAULT_SETTINGS.pinned,
    widgetHabitIds: Array.isArray(base.widgetHabitIds) ? base.widgetHabitIds : [],
    weeklySummary: { ...DEFAULT_SETTINGS.weeklySummary, ...(base.weeklySummary ?? {}) },
    theme: base.theme === 'light' || base.theme === 'system' ? base.theme : 'dark',
    appLock: { ...DEFAULT_SETTINGS.appLock, ...(base.appLock ?? {}) },
    cycle: {
      ...DEFAULT_SETTINGS.cycle,
      ...cycle,
      history: sanitizePeriodHistory(cycle.history),
      reminders: sanitizeCycleReminders(cycle.reminders) ?? DEFAULT_SETTINGS.cycle.reminders,
    },
  };
}

/**
 * Validate the shape of a saved / imported state. Throws StorageError with a
 * user-readable message on anything unusable: wrong app, a newer data version,
 * a missing list, or a record without its required fields.
 */
export function parseState(raw: unknown): TrackerState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new StorageError('Not a Daily Tracker export.');
  const s = raw as Partial<TrackerState>;
  if (typeof s.version !== 'number') throw new StorageError('Not a Daily Tracker export (no data version).');
  if (s.version > DATA_VERSION) throw new StorageError(`This backup was made by a newer version of the app (data version ${s.version}). Update the app, then import it again.`);
  if (s.version !== DATA_VERSION) throw new StorageError(`Unsupported data version ${String(s.version)}.`);
  const lists = ['habits', 'rules', 'policies', 'entries', 'water', 'snacks', 'mind'] as const;
  for (const key of lists) {
    if (!Array.isArray(s[key])) throw new StorageError(`Missing "${key}" list.`);
  }
  rejectDamagedContainers(s);
  const state: TrackerState = {
    version: 1,
    habits: s.habits!,
    rules: s.rules!,
    policies: s.policies!,
    entries: s.entries!,
    water: s.water!,
    snacks: s.snacks!,
    mind: s.mind!,
    // Lists added after the first exports; older files simply lack them.
    nudgeEvents: Array.isArray(s.nudgeEvents) ? s.nudgeEvents : [],
    events: Array.isArray(s.events) ? s.events : [],
    settings: normalizeSettings(s.settings),
    body: normalizeBody(s.body),
    cycleLogs: normalizeCycleLogs(s.cycleLogs),
    ...(s.nudgeSnoozedUntil !== undefined ? { nudgeSnoozedUntil: s.nudgeSnoozedUntil } : {}),
    ...(s.nudgeSwap !== undefined ? { nudgeSwap: s.nudgeSwap } : {}),
  };
  try {
    validateRecords(state);
  } catch (err) {
    if (err instanceof ValidationError) throw new StorageError(`The file has data this version of the app cannot read (${err.message}). It may be damaged, or made by a newer version.`);
    throw err;
  }
  // Only the known fields travel on: whatever else a file carries next to them stays in the file.
  return projectRecords(state);
}

/**
 * Lists added after the first exports may be *absent* (an older file) — but a list that is present
 * and not a list, or a period / day log without its day, is damage, and damage must stop an import
 * before the lenient normalizers below quietly turn it into "nothing logged": the person would then
 * replace everything they have with a file that lost its cycle or body history.
 */
function rejectDamagedContainers(s: Partial<TrackerState>): void {
  const presentList = (value: unknown, name: string) => {
    if (value !== undefined && value !== null && !Array.isArray(value)) throw new StorageError(`The file is damaged ("${name}" is not a list).`);
  };
  presentList(s.nudgeEvents, 'nudgeEvents');
  presentList(s.events, 'events');
  presentList(s.cycleLogs, 'cycleLogs');
  if (Array.isArray(s.cycleLogs)) {
    s.cycleLogs.forEach((item: unknown, i) => {
      if (!item || typeof item !== 'object' || !isCalendarDay((item as Partial<CycleDayLog>).day)) throw new StorageError(`The file is damaged (cycleLogs[${i}] has no day).`);
    });
  }
  if (s.body !== undefined && s.body !== null) {
    if (typeof s.body !== 'object' || Array.isArray(s.body)) throw new StorageError('The file is damaged ("body" is not a record).');
    for (const key of ['steps', 'sleep', 'heart', 'weight', 'workouts'] as const) presentList((s.body as unknown as Record<string, unknown>)[key], `body.${key}`);
  }
  const cycle = s.settings && typeof s.settings === 'object' ? (s.settings as Partial<TrackerState['settings']>).cycle : undefined;
  if (cycle && typeof cycle === 'object') {
    presentList(cycle.history, 'settings.cycle.history');
    if (Array.isArray(cycle.history)) {
      cycle.history.forEach((item: unknown, i) => {
        const span = item as Partial<{ start: unknown; end: unknown }> | null;
        if (!span || typeof span !== 'object' || !isCalendarDay(span.start)) throw new StorageError(`The file is damaged (settings.cycle.history[${i}] has no start day).`);
        if (span.end !== undefined && (!isCalendarDay(span.end) || span.end < (span.start as string))) throw new StorageError(`The file is damaged (settings.cycle.history[${i}] ends before it starts).`);
      });
    }
    presentList(cycle.reminders, 'settings.cycle.reminders');
  }
}

/** Day logs from older files may lack the symptoms map. */
export function normalizeCycleLogs(raw: unknown): CycleDayLog[] {
  if (!Array.isArray(raw)) return [];
  const out: CycleDayLog[] = [];
  for (const item of raw as Partial<CycleDayLog>[]) {
    if (!item || typeof item.day !== 'string') continue;
    const log: CycleDayLog = { day: item.day, symptoms: item.symptoms && typeof item.symptoms === 'object' ? item.symptoms : {} };
    if (item.flow !== undefined) log.flow = item.flow;
    if (item.mood !== undefined) log.mood = item.mood;
    if (item.note) log.note = item.note;
    out.push(log);
  }
  return out;
}

/** Identity-based diff: items are immutable, so a changed item is a new object. */
export function diffById<T>(prev: readonly T[], next: readonly T[], key: (item: T) => string): { upsert: T[]; remove: string[] } {
  if (prev === next) return { upsert: [], remove: [] };
  const prevItems = new Set<T>(prev);
  const nextKeys = new Set<string>();
  const upsert: T[] = [];
  for (const item of next) {
    nextKeys.add(key(item));
    if (!prevItems.has(item)) upsert.push(item);
  }
  const remove: string[] = [];
  for (const item of prev) {
    const k = key(item);
    if (!nextKeys.has(k)) remove.push(k);
  }
  return { upsert, remove };
}
