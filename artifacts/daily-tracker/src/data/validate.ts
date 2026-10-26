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
import { isCalendarDay, isInstantMs, MAX_INSTANT_MS } from '@/src/domain/time/trackingDay';

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
/** Longest text an export file may carry (a cycle note, a habit name…); the note editor stops at the same length. */
export const MAX_TEXT = 20_000;

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
/** A finite number inside [min, max]; `integer` also rejects fractions (subnormal intervals once hung the planner). */
const numRange =
  (min: number, max: number, integer = false): Check =>
  (v, p) => {
    num(v, p);
    const n = v as number;
    if (n < min || n > max) fail(p, `expected a number between ${min} and ${max}`);
    if (integer && !Number.isInteger(n)) fail(p, 'expected a whole number');
  };
const nonNeg = numRange(0, 1e9);
/** An epoch-ms timestamp `new Date` can represent (1970 … 9999): a finite 1e300 would throw in every formatter. */
const instant: Check = (v, p) => {
  num(v, p);
  if (!isInstantMs(v)) fail(p, `expected a timestamp between 0 and ${MAX_INSTANT_MS}`);
};
const minuteOfDay = numRange(0, 24 * 60, true);
/** A clock time the planner can place: "07:30", never "25:99" or free text. */
const clockTime: Check = (v, p) => {
  if (typeof v !== 'string' || !HHMM.test(v)) fail(p, 'expected a time like 07:30');
};
const day: Check = (v, p) => {
  if (!isCalendarDay(v)) fail(p, 'expected a day like 2026-01-31');
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
type Shape = Record<string, Check>;
const record =
  (shape: Shape): Check =>
  (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'expected a record');
    const obj = v as Record<string, unknown>;
    for (const key of Object.keys(shape)) shape[key]!(obj[key], `${p}.${key}`);
  };
/** A record with a start and an end instant, in that order. */
const span =
  (shape: Shape): Check =>
  (v, p) => {
    record(shape)(v, p);
    const o = v as { startAt: number; endAt: number };
    if (o.endAt < o.startAt) fail(`${p}.endAt`, 'ends before it starts');
  };
/**
 * The row with only the shape's fields (absent and null ones dropped). An imported file may carry
 * anything else next to the known fields — a renamed field from another version, or a 12,000-level
 * nested array that validates fine (it is never looked at) and then blows the stack in every later
 * serialisation (the next export, the hourly snapshot). Nothing unknown reaches the state.
 */
const pick =
  (shape: Shape) =>
  (row: unknown): Record<string, unknown> => {
    const obj = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const v = obj[key];
      if (v !== undefined && v !== null) out[key] = v;
    }
    return out;
  };
/** A free-form map: every own key short, every value checked (a symptom map with a severity of 4 must not reach the day sheet). */
const mapOf =
  (check: Check, maxKeys = 100, maxKey = 64): Check =>
  (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'expected a map');
    const keys = Object.keys(v as object);
    if (keys.length > maxKeys) fail(p, `too many keys (${keys.length})`);
    for (const key of keys) {
      if (key.length === 0 || key.length > maxKey) fail(`${p}.${key.slice(0, 20)}`, 'bad key');
      check((v as Record<string, unknown>)[key], `${p}.${key}`);
    }
  };

const CATEGORIES = ['hydration', 'movement', 'mind', 'cycle', 'body', 'fuel', 'craft'] as const;
const HABIT_TYPES = ['YES_NO', 'COUNT', 'AMOUNT', 'TIMER'] as const;
const CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
const SOURCES = ['MANUAL', 'AUTO_HC', 'AUTO_WATER', 'AUTO_TIMER', 'AUTO_WIDGET'] as const;
const SNACK_TYPES = ['SQUATS', 'CALF_RAISES', 'WALK', 'STRETCH', 'PUSH_UPS', 'STAIRS', 'VIGOROUS_MINUTE'] as const;
const SNACK_TRIGGERS = ['NUDGE', 'WIDGET', 'SUGAR_SHIELD', 'MANUAL'] as const;
const MIND_KINDS = ['MEDITATION', 'BREATHING'] as const;
const NUDGE_KINDS = ['INTERVAL', 'FIXED', 'ROTATION', 'EVENT', 'CYCLE', 'NONE'] as const;
const NUDGE_EVENT_KINDS = ['FIRED', 'DONE', 'SNOOZED', 'SWAPPED', 'DISMISSED', 'WATER'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const HABIT: Shape = {
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
};
const RULE: Shape = {
  habitId: id,
  effectiveFrom: day,
  cadence: oneOf(CADENCES),
  timesPerPeriod: numRange(1, 31, true),
  target: numRange(0, 1e6),
  freezesPerMonth: numRange(0, 31, true),
};
const POLICY: Shape = {
  habitId: id,
  kind: oneOf(NUDGE_KINDS),
  intervalMin: optional(numRange(1, 24 * 60, true)),
  times: optional(listOf(clockTime, 100)),
  activeStartMin: optional(minuteOfDay),
  activeEndMin: optional(minuteOfDay),
  onlyWhenBehind: bool,
  maxPerDay: numRange(0, 100, true),
  enabled: bool,
};
const ENTRY: Shape = { id, habitId: id, day, at: instant, zone: str, value: nonNeg, source: oneOf(SOURCES) };
const WATER: Shape = { id, at: instant, zone: str, day, ml: nonNeg, source: oneOf(SOURCES), externalId: optional(str) };
const SNACK: Shape = { id, at: instant, zone: str, day, type: oneOf(SNACK_TYPES), reps: optional(nonNeg), seconds: optional(nonNeg), trigger: oneOf(SNACK_TRIGGERS) };
const MIND: Shape = { id, startAt: instant, endAt: instant, zone: str, day, kind: oneOf(MIND_KINDS), minutes: nonNeg };
const NUDGE_EVENT: Shape = { id, nudgeId: str, habitIds: listOf(str, 100), at: instant, zone: str, day: str, kind: oneOf(NUDGE_EVENT_KINDS), untilMs: optional(instant), via: optional(str) };
const SCHEDULED_EVENT: Shape = { id, habitId: str, at: instant, zone: str, day: str, title: str, body: str };
const STEP_DAY: Shape = { day, steps: nonNeg, origin: optional(str) };
const SLEEP_NIGHT: Shape = { id, startAt: instant, endAt: instant, day, minutes: nonNeg, deepMin: optional(nonNeg), remMin: optional(nonNeg), lightMin: optional(nonNeg), awakeMin: optional(nonNeg), origin: optional(str) };
const HEART_DAY: Shape = { day, restingBpm: optional(nonNeg), minBpm: optional(nonNeg), avgBpm: optional(nonNeg), maxBpm: optional(nonNeg) };
const WEIGHT: Shape = { id, at: instant, day, kg: nonNeg, origin: optional(str) };
const WORKOUT: Shape = { id, startAt: instant, endAt: instant, day, type: num, title: optional(str), minutes: nonNeg, origin: optional(str), hidden: optional(bool) };
const CYCLE_LOG: Shape = { day, flow: optional(numRange(1, 3, true)), mood: optional(numRange(1, 5, true)), symptoms: optional(mapOf(numRange(1, 3, true))), note: optional(str) };
const NUDGE_SWAP: Shape = { day: str, offset: num };

const habit = record(HABIT);
const rule = record(RULE);
const policy = record(POLICY);
const entry = record(ENTRY);
const water = record(WATER);
const snack = record(SNACK);
const mind = span(MIND);
const nudgeEvent = record(NUDGE_EVENT);
const scheduledEvent = record(SCHEDULED_EVENT);
const stepDay = record(STEP_DAY);
const sleepNight = span(SLEEP_NIGHT);
const heartDay = record(HEART_DAY);
const weight = record(WEIGHT);
const workout = span(WORKOUT);
const cycleLog = record(CYCLE_LOG);

/**
 * Every persisted list has a primary key; SQLite upserts on it, so two rows
 * with the same key would silently collapse into one after the first save.
 * Refuse the file instead.
 */
function uniqueBy(list: unknown, keyOf: (row: Record<string, unknown>) => string, path: string): void {
  if (!Array.isArray(list)) return;
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const key = keyOf(list[i] as Record<string, unknown>);
    if (seen.has(key)) fail(`${path}[${i}]`, `duplicate key ${key}`);
    seen.add(key);
  }
}
const byId = (row: Record<string, unknown>) => String(row.id);
const byDay = (row: Record<string, unknown>) => String(row.day);

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
  optional(instant)(s.nudgeSnoozedUntil, 'nudgeSnoozedUntil');
  optional(record(NUDGE_SWAP))(s.nudgeSwap, 'nudgeSwap');

  uniqueBy(s.habits, byId, 'habits');
  uniqueBy(s.rules, (r) => `${String(r.habitId)}|${String(r.effectiveFrom)}`, 'rules');
  uniqueBy(s.policies, (r) => String(r.habitId), 'policies');
  uniqueBy(s.entries, byId, 'entries');
  uniqueBy(s.water, byId, 'water');
  uniqueBy(s.snacks, byId, 'snacks');
  uniqueBy(s.mind, byId, 'mind');
  uniqueBy(s.nudgeEvents, byId, 'nudgeEvents');
  uniqueBy(s.events, byId, 'events');
  uniqueBy(s.body.steps, byDay, 'body.steps');
  uniqueBy(s.body.sleep, byId, 'body.sleep');
  uniqueBy(s.body.heart, byDay, 'body.heart');
  uniqueBy(s.body.weight, byId, 'body.weight');
  uniqueBy(s.body.workouts, byId, 'body.workouts');
  uniqueBy(s.cycleLogs, byDay, 'cycleLogs');
}

type Validated = Parameters<typeof validateRecords>[0];

/**
 * The same state with every row reduced to its known fields. Call after `validateRecords`
 * (which guarantees the lists are lists of records); the result is what the reducer and the
 * database get, so a file's extra baggage never travels with the user's data.
 */
export function projectRecords<T extends Validated>(s: T): T {
  const rows = (list: unknown, shape: Shape) => (list as unknown[]).map(pick(shape));
  const symptoms = (row: Record<string, unknown>) => {
    // The symptom map is validated key by key; copy it onto a plain object so a key like
    // "__proto__" from the file stays an own property and nothing else.
    if (!row.symptoms || typeof row.symptoms !== 'object') return row;
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(row.symptoms as object)) clean[key] = (row.symptoms as Record<string, unknown>)[key];
    return { ...row, symptoms: clean };
  };
  const out = {
    ...s,
    habits: rows(s.habits, HABIT),
    rules: rows(s.rules, RULE),
    policies: rows(s.policies, POLICY),
    entries: rows(s.entries, ENTRY),
    water: rows(s.water, WATER),
    snacks: rows(s.snacks, SNACK),
    mind: rows(s.mind, MIND),
    nudgeEvents: rows(s.nudgeEvents, NUDGE_EVENT).map((e) => ({ ...e, habitIds: [...(e.habitIds as string[])] })),
    events: rows(s.events, SCHEDULED_EVENT),
    body: {
      ...s.body,
      steps: rows(s.body.steps, STEP_DAY),
      sleep: rows(s.body.sleep, SLEEP_NIGHT),
      heart: rows(s.body.heart, HEART_DAY),
      weight: rows(s.body.weight, WEIGHT),
      workouts: rows(s.body.workouts, WORKOUT),
    },
    cycleLogs: rows(s.cycleLogs, CYCLE_LOG).map(symptoms),
  };
  if (s.nudgeSwap !== undefined && s.nudgeSwap !== null) out.nudgeSwap = pick(NUDGE_SWAP)(s.nudgeSwap);
  return out as T;
}

/**
 * Bounds for the numeric settings. A value outside its range (a hand edit, a
 * newer version with different units) falls back to the default rather than
 * reaching the planner, which loops over intervals and active hours.
 */
/** The daily water goal's bounds, shared with the Water habit's target (editor, Settings, the mirror between them). */
export const WATER_GOAL_MIN_ML = 100;
export const WATER_GOAL_MAX_ML = 20_000;
/** The largest single drink any path may log (sheets, the habit page, a notification button). */
export const MAX_WATER_LOG_ML = WATER_GOAL_MAX_ML;

const SETTINGS_RANGES: Record<string, readonly [number, number, boolean]> = {
  waterGoalMl: [WATER_GOAL_MIN_ML, WATER_GOAL_MAX_ML, false],
  activeStartMin: [0, 24 * 60, true],
  activeEndMin: [0, 24 * 60, true],
  dayBoundaryHour: [0, 23, true],
  nudgeIntervalMin: [5, 12 * 60, true],
  dailyNudgeCap: [0, 100, true],
  tapSizeMl: [10, 2000, false],
  'weeklySummary.weekday': [0, 6, true],
  'weeklySummary.minute': [0, 24 * 60 - 1, true],
  'appLock.afterMin': [0, 24 * 60, true],
  'cycle.avgCycleDays': [15, 60, true],
  'cycle.periodDays': [1, 14, true],
  'cycle.lutealDays': [7, 20, true],
};

function inRange(key: string, v: number): boolean {
  const r = SETTINGS_RANGES[key];
  if (!r) return true;
  const [min, max, integer] = r;
  return v >= min && v <= max && (!integer || Number.isInteger(v));
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
      if (v && typeof v === 'object' && !Array.isArray(v)) out[key] = sanitizeObject(v as Record<string, unknown>, def as Record<string, unknown>, key);
    } else if (typeof v === typeof def) {
      if (typeof v !== 'number' || (Number.isFinite(v) && inRange(key, v))) out[key] = v;
    }
  }
  // Optional fields without a default.
  if (isInstantMs(base.offUntil)) out.offUntil = base.offUntil;
  return out as Partial<Settings>;
}

/** Period spans the timeline can sort and compare: a real start day, an optional end day. */
export function sanitizePeriodHistory(raw: unknown): PeriodSpan[] {
  if (!Array.isArray(raw)) return [];
  const out: PeriodSpan[] = [];
  for (const item of raw as Partial<PeriodSpan>[]) {
    if (!item || typeof item !== 'object' || !isCalendarDay(item.start)) continue;
    const span: PeriodSpan = { start: item.start };
    if (isCalendarDay(item.end) && item.end >= item.start) span.end = item.end;
    if (item.excluded === true) span.excluded = true; // a cycle the user took out of the averages stays out
    out.push(span);
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
    if (typeof item.offsetDays !== 'number' || !Number.isInteger(item.offsetDays) || Math.abs(item.offsetDays) > 60) continue;
    if (typeof item.minute !== 'number' || !Number.isInteger(item.minute) || item.minute < 0 || item.minute >= 24 * 60) continue;
    const reminder: CycleReminder = { id: item.id, label: item.label, anchor: item.anchor, offsetDays: item.offsetDays, minute: item.minute, enabled: item.enabled === true };
    if (item.phase === 'period' || item.phase === 'fertile' || item.phase === 'luteal') reminder.phase = item.phase;
    out.push(reminder);
  }
  return out;
}

function sanitizeObject(v: Record<string, unknown>, def: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, d] of Object.entries(def)) {
    const x = v[key];
    if (x === undefined || x === null) continue;
    const path = `${prefix}.${key}`;
    if (Array.isArray(d)) {
      if (Array.isArray(x)) out[key] = x.filter((item) => item && typeof item === 'object');
    } else if (typeof d === 'object') {
      if (x && typeof x === 'object' && !Array.isArray(x)) out[key] = sanitizeObject(x as Record<string, unknown>, d as Record<string, unknown>, path);
    } else if (typeof x === typeof d) {
      if (typeof x !== 'number' || (Number.isFinite(x) && inRange(path, x))) out[key] = x;
    }
  }
  return out;
}
