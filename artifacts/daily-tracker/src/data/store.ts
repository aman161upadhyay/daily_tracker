/**
 * Persistence boundary. The reducer stays pure; a store receives consecutive
 * states and writes whatever changed between them.
 *
 * Native uses row-level SQLite (`sql/sqliteStore.ts`) so that future headless
 * writers (notification actions, the widget) can add a single row without
 * clobbering a whole-state blob. Web and tests use a JSON blob
 * (`jsonStore.ts`) because expo-sqlite on web needs wasm + COOP/COEP headers.
 */
import { DEFAULT_SETTINGS, type Settings } from '@/src/domain/models';
import type { TrackerState } from '@/src/state/types';

export interface TrackerStore {
  /** Saved state, or null on a fresh install. */
  load(): Promise<TrackerState | null>;
  /** Write the difference between two consecutive states. */
  persist(prev: TrackerState, next: TrackerState): Promise<void>;
  /** Write a whole state, replacing everything saved (first run, import). */
  replace(state: TrackerState): Promise<void>;
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

/** Fill in settings added after a state was saved, so new fields get defaults. */
export function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const base = raw ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...base,
    pinned: Array.isArray(base.pinned) ? base.pinned : DEFAULT_SETTINGS.pinned,
    widgetHabitIds: Array.isArray(base.widgetHabitIds) ? base.widgetHabitIds : [],
    weeklySummary: { ...DEFAULT_SETTINGS.weeklySummary, ...(base.weeklySummary ?? {}) },
    cycle: { ...DEFAULT_SETTINGS.cycle, ...(base.cycle ?? {}), history: Array.isArray(base.cycle?.history) ? base.cycle.history : [] },
  };
}

/** Validate the shape of a saved / imported state. Throws on anything unusable. */
export function parseState(raw: unknown): TrackerState {
  if (!raw || typeof raw !== 'object') throw new StorageError('Not a Daily Tracker export.');
  const s = raw as Partial<TrackerState>;
  if (s.version !== 1) throw new StorageError(`Unsupported data version ${String(s.version)}.`);
  const lists = ['habits', 'rules', 'policies', 'entries', 'water', 'snacks', 'mind'] as const;
  for (const key of lists) {
    if (!Array.isArray(s[key])) throw new StorageError(`Missing "${key}" list.`);
  }
  return {
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
    ...(s.nudgeSnoozedUntil !== undefined ? { nudgeSnoozedUntil: s.nudgeSnoozedUntil } : {}),
    ...(s.nudgeSwap !== undefined ? { nudgeSwap: s.nudgeSwap } : {}),
  };
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
