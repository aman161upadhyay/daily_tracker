/**
 * Shape validation for imported / restored data. A backup file is untrusted
 * input: it may come from a newer app version, a damaged download or a hand
 * edit. Every record that reaches the reducer or the SQLite tables must have
 * its required fields with the right types, otherwise one bad row can crash
 * a screen or throw inside a write transaction long after the import.
 *
 * Deliberately a small hand-rolled checker (no schema library): the shapes
 * live in `src/domain`, and the messages name the offending path so a user
 * can tell "newer app" from "broken file".
 */
import type { CycleReminder, PeriodSpan, Settings } from '@/src/domain/models';
import { DEFAULT_SETTINGS } from '@/src/domain/models';

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Per-list ceiling; 20 years of logging every 5 minutes stays well under it. */
export const MAX_ROWS = 500_000;
/** Longest free-text field (a note). */
const MAX_TEXT = 20_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Check = (v: unknown, path: string) => void;

function fail(path: string, message: string): never {
  throw new ValidationError(`${path}: ${message}`, path);
}

const str: Check = (v, p) => {
  if (typeof v !== 'string') fail(p, 'expected text');
  if (v.length > MAX_TEXT) fail(p, 'text is too long');
};
const id: Check = (v, p) => {
  str(v, p);
  if ((v as string).length === 0) fail(p, 'expected an id');
};
const num: Check = (v, p) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(p, 'expected a number');
};
const bool: Check = (v, p) => {
  if (typeof v !== 'boolean') fail(p, 'expected true or false');
};
const day: Check = (v, p) => {
  if (typeof v !== 'string' || !DAY.test(v)) fail(p, 'expected a day like 2026-01-31');
};
const oneOf =
  (values: readonly string[]): Check =>
  (v, p) => {
    if (typeof v !== 'string' || !values.includes(v)) fail(p, `"${String(v)}" is not one of ${values.join(', ')}`);
  };
const optional =
  (check: Check): Check =>
  (v, p) => {
    if (v !== undefined && v !== null) check(v, p);
  };
const listOf =
  (check: Check, max = MAX_ROWS): Check =>
  (v, p) => {
    if (!Array.isArray(v)) fail(p, 'expected a list');
    if (v.length > max) fail(p, `too many items (${v.length})`);
    for (let i = 0; i < v.length; i++) check(v[i], `${p}[${i}]`);
  };
const record =
  (shape: Record<string, Check>): Check =>
  (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'expected a record');
    const obj = v as Record<string, unknown>;
    for (const key of Object.keys(shape)) shape[key]!(obj[key], `${p}.${key}`);
  };

const CATEGORIES = ['hydration', 'movement', 'mind', 'cycle', 'body', 'fuel', 'craft'] as const;
const HABIT_TYPES = ['YES_NO', 'COUNT', 'AMOUNT', 'TIMER'] as const;
const CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
const SOURCES = ['MANUAL', 'AUTO_HC', 'AUTO_WATER', 'AUTO_TIMER', 'AUTO_WIDGET'] as const;
const SNACK_TYPES = ['SQUATS', 'CALF_RAISES', 'WALK', 'STRETCH', 'PUSH_UPS', 'STAIRS', 'VIGOROUS_MINUTE'] as const;
const SNACK_TRIGGERS = ['NUDGE', 'WIDGET', 'SUGAR_SHIELD', 'MANUAL'] as const;
const MIND_KINDS = ['MEDITATION', 'BREATHING'] as const;
const NUDGE_KINDS = ['INTERVAL', 'FIXED', 'ROTATION', 'EVENT', 'CYCLE', 'NONE'] as const;
const NUDGE_EVENT_KINDS = ['FIRED', 'DONE', 'SNOOZED', 'SWAPPED', 'DISMISSED'] as const;

const habit = record({
  id,
  name: str,
  category: oneOf(CATEGORIES),
  type: oneOf(HABIT_TYPES),
  unit: str,
  icon: str, // unknown icons fall back to a tick in the UI
  presetId: optional(str),
  snackType: optional(oneOf(SNACK_TYPES)),
  mindKind: optional(oneOf(MIND_KINDS)),
  createdDay: day,
  archived: bool,
  pinned: bool,
});
const rule = record({ habitId: id, effectiveFrom: day, cadence: oneOf(CADENCES), timesPerPeriod: num, target: num, freezesPerMonth: num });
const policy = record({
  habitId: id,
  kind: oneOf(NUDGE_KINDS),
  intervalMin: optional(num),
  times: optional(listOf(str, 100)),
  activeStartMin: optional(num),
  activeEndMin: optional(num),
  onlyWhenBehind: bool,
  maxPerDay: num,
  enabled: bool,
});
const entry = record({ id, habitId: id, day, at: num, zone: str, value: num, source: oneOf(SOURCES) });
const water = record({ id, at: num, zone: str, day, ml: num, source: oneOf(SOURCES), externalId: optional(str) });
const snack = record({ id, at: num, zone: str, day, type: oneOf(SNACK_TYPES), reps: optional(num), seconds: optional(num), trigger: oneOf(SNACK_TRIGGERS) });
const mind = record({ id, startAt: num, endAt: num, zone: str, day, kind: oneOf(MIND_KINDS), minutes: num });
const nudgeEvent = record({ id, nudgeId: str, habitIds: listOf(str, 100), at: num, zone: str, day: str, kind: oneOf(NUDGE_EVENT_KINDS), untilMs: optional(num) });
const scheduledEvent = record({ id, habitId: str, at: num, zone: str, day: str, title: str, body: str });
const stepDay = record({ day, steps: num, origin: optional(str) });
const sleepNight = record({ id, startAt: num, endAt: num, day, minutes: num, deepMin: optional(num), remMin: optional(num), lightMin: optional(num), awakeMin: optional(num), origin: optional(str) });
const heartDay = record({ day, restingBpm: optional(num), minBpm: optional(num), avgBpm: optional(num), maxBpm: optional(num) });
const weight = record({ id, at: num, day, kg: num, origin: optional(str) });
const workout = record({ id, startAt: num, endAt: num, day, type: num, title: optional(str), minutes: num, origin: optional(str), hidden: optional(bool) });
const cycleLog = record({ day, flow: optional(num), mood: optional(num), symptoms: optional(record({})), note: optional(str) });

/**
 * Check every list of an already-normalized state (lists present, settings and
 * body filled in). Throws ValidationError naming the first bad field.
 */
export function validateRecords(s: {
  habits: unknown;
  rules: unknown;
  policies: unknown;
  entries: unknown;
  water: unknown;
  snacks: unknown;
  mind: unknown;
  nudgeEvents: unknown;
  events: unknown;
  body: { steps: unknown; sleep: unknown; heart: unknown; weight: unknown; workouts: unknown };
  cycleLogs: unknown;
  nudgeSnoozedUntil?: unknown;
  nudgeSwap?: unknown;
}): void {
  listOf(habit)(s.habits, 'habits');
  listOf(rule)(s.rules, 'rules');
  listOf(policy)(s.policies, 'policies');
  listOf(entry)(s.entries, 'entries');
  listOf(water)(s.water, 'water');
  listOf(snack)(s.snacks, 'snacks');
  listOf(mind)(s.mind, 'mind');
  listOf(nudgeEvent)(s.nudgeEvents, 'nudgeEvents');
  listOf(scheduledEvent)(s.events, 'events');
  listOf(stepDay)(s.body.steps, 'body.steps');
  listOf(sleepNight)(s.body.sleep, 'body.sleep');
  listOf(heartDay)(s.body.heart, 'body.heart');
  listOf(weight)(s.body.weight, 'body.weight');
  listOf(workout)(s.body.workouts, 'body.workouts');
  listOf(cycleLog)(s.cycleLogs, 'cycleLogs');
  optional(num)(s.nudgeSnoozedUntil, 'nudgeSnoozedUntil');
  optional(record({ day: str, offset: num }))(s.nudgeSwap, 'nudgeSwap');
}

/**
 * Settings from a file: keep only known keys, and only when the type matches
 * the default's. Anything else (a renamed field, a hand edit, a value from a
 * newer version) falls back to the default instead of being carried into the
 * state and the database as-is.
 */
export function sanitizeSettings(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const base = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = base[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(def)) {
      if (Array.isArray(v)) out[key] = v.filter((x) => typeof x === 'string');
    } else if (typeof def === 'object') {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[key] = sanitizeObject(v as Record<string, unknown>, def as Record<string, unknown>);
    } else if (typeof v === typeof def) {
      if (typeof v !== 'number' || Number.isFinite(v)) out[key] = v;
    }
  }
  // Optional fields without a default.
  if (typeof base.offUntil === 'number' && Number.isFinite(base.offUntil)) out.offUntil = base.offUntil;
  return out as Partial<Settings>;
}

/** Period spans the timeline can sort and compare: a real start day, an optional end day. */
export function sanitizePeriodHistory(raw: unknown): PeriodSpan[] {
  if (!Array.isArray(raw)) return [];
  const out: PeriodSpan[] = [];
  for (const item of raw as Partial<PeriodSpan>[]) {
    if (!item || typeof item !== 'object' || typeof item.start !== 'string' || !DAY.test(item.start)) continue;
    out.push(typeof item.end === 'string' && DAY.test(item.end) ? { start: item.start, end: item.end } : { start: item.start });
  }
  return out;
}

export function sanitizeCycleReminders(raw: unknown): CycleReminder[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CycleReminder[] = [];
  for (const item of raw as Partial<CycleReminder>[]) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || typeof item.label !== 'string') continue;
    if (item.anchor !== 'BEFORE_PERIOD' && item.anchor !== 'PHASE_START') continue;
    if (typeof item.offsetDays !== 'number' || !Number.isFinite(item.offsetDays)) continue;
    if (typeof item.minute !== 'number' || !Number.isFinite(item.minute)) continue;
    const reminder: CycleReminder = { id: item.id, label: item.label, anchor: item.anchor, offsetDays: item.offsetDays, minute: item.minute, enabled: item.enabled === true };
    if (item.phase === 'period' || item.phase === 'fertile' || item.phase === 'luteal') reminder.phase = item.phase;
    out.push(reminder);
  }
  return out;
}

function sanitizeObject(v: Record<string, unknown>, def: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, d] of Object.entries(def)) {
    const x = v[key];
    if (x === undefined || x === null) continue;
    if (Array.isArray(d)) {
      if (Array.isArray(x)) out[key] = x.filter((item) => item && typeof item === 'object');
    } else if (typeof d === 'object') {
      if (x && typeof x === 'object' && !Array.isArray(x)) out[key] = sanitizeObject(x as Record<string, unknown>, d as Record<string, unknown>);
    } else if (typeof x === typeof d) {
      if (typeof x !== 'number' || Number.isFinite(x)) out[key] = x;
    }
  }
  return out;
}
