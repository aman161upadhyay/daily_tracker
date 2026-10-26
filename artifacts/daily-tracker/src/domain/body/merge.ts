/**
 * Fold a Health Connect read into the stored mirrors. Idempotent: reading the
 * same days again changes nothing, and a changed value replaces the old row
 * (data arrives late — yesterday is always re-read). Returns the same object
 * when nothing changed so persistence and the widget can skip work.
 */
import type { BodyBatch, BodyRecordType, BodyState, HeartDay, SleepNight, StepDay, WeightEntry, Workout } from './types';
import { BODY_RECORD_TYPES, EMPTY_BODY } from './types';

type Keyed<T> = { key: (x: T) => string; same: (a: T, b: T) => boolean };

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  return true;
}

function upsert<T extends object>(prev: T[], incoming: T[] | undefined, k: Keyed<T>, combine: (old: T, next: T) => T = (_, n) => n): T[] {
  if (!incoming || incoming.length === 0) return prev;
  const byKey = new Map(prev.map((x) => [k.key(x), x]));
  let changed = false;
  for (const next of incoming) {
    const key = k.key(next);
    const old = byKey.get(key);
    if (old) {
      const merged = combine(old, next);
      if (!k.same(old, merged)) {
        byKey.set(key, merged);
        changed = true;
      }
    } else {
      byKey.set(key, next);
      changed = true;
    }
  }
  return changed ? [...byKey.values()] : prev;
}

const STEP: Keyed<StepDay> = { key: (x) => x.day, same: shallowEqual };
const SLEEP: Keyed<SleepNight> = { key: (x) => x.id, same: shallowEqual };
const HEART: Keyed<HeartDay> = { key: (x) => x.day, same: shallowEqual };
const WEIGHT: Keyed<WeightEntry> = { key: (x) => x.id, same: shallowEqual };
const WORKOUT: Keyed<Workout> = { key: (x) => x.id, same: shallowEqual };

/** Drop `undefined` fields so stored rows and re-read rows compare equal. */
function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Drop rows whose day lies inside the read window but which the read did not return: the
 * record was deleted (or moved) in Health Connect. Only runs for lists the read covered.
 */
function prune<T extends { day: string }>(prev: T[], incoming: T[] | undefined, k: Keyed<T>, window: BodyBatch['window']): T[] {
  if (!incoming || !window) return prev;
  const seen = new Set(incoming.map(k.key));
  const kept = prev.filter((x) => x.day < window.fromDay || x.day > window.toDay || seen.has(k.key(x)));
  return kept.length === prev.length ? prev : kept;
}

/** The two heart reads (samples aggregate, resting records) each give one row per day; fold them into one. */
function coalesceHeart(rows: HeartDay[] | undefined): HeartDay[] | undefined {
  if (!rows) return rows;
  const byDay = new Map<string, HeartDay>();
  for (const r of rows) byDay.set(r.day, compact({ ...byDay.get(r.day), ...r }));
  return [...byDay.values()];
}

const BOTH_HEART = { samples: true, resting: true };

/** The fields of a stored heart day that a read did not cover (and so cannot confirm or deny). */
function uncoveredHeart(old: HeartDay, sources: NonNullable<BodyBatch['heartSources']>): HeartDay {
  const keep: HeartDay = { day: old.day };
  if (!sources.samples) {
    keep.minBpm = old.minBpm;
    keep.avgBpm = old.avgBpm;
    keep.maxBpm = old.maxBpm;
  }
  if (!sources.resting) keep.restingBpm = old.restingBpm;
  return keep;
}

/**
 * Heart rows inside a complete read's window: a day the read did not return loses the fields the
 * read covered (deleted upstream) and keeps the rest; a row with nothing left goes. With only one
 * heart permission granted, the other subtype's values survive every sync.
 */
function pruneHeart(prev: HeartDay[], incoming: HeartDay[] | undefined, window: BodyBatch['window'], sources: NonNullable<BodyBatch['heartSources']>): HeartDay[] {
  if (!incoming || !window) return prev;
  const seen = new Set(incoming.map((x) => x.day));
  let changed = false;
  const kept: HeartDay[] = [];
  for (const x of prev) {
    if (x.day < window.fromDay || x.day > window.toDay || seen.has(x.day)) {
      kept.push(x);
      continue;
    }
    const rest = compact(uncoveredHeart(x, sources));
    if (Object.keys(rest).length > 1) kept.push(rest);
    if (Object.keys(rest).length <= 1 || !shallowEqual(rest, x)) changed = true;
  }
  return changed ? kept : prev;
}

export function mergeBody(body: BodyState, batch: BodyBatch): BodyState {
  const w = batch.window;
  const steps = prune(upsert(body.steps, batch.steps?.map(compact), STEP), batch.steps, STEP, w);
  const sleep = prune(upsert(body.sleep, batch.sleep?.map(compact), SLEEP), batch.sleep, SLEEP, w);
  // A complete read says everything there is about the heart fields it covered, so those replace
  // the stored ones (a resting value deleted upstream goes away too); fields of a read it did not
  // cover (permission not granted) stay. A partial read only fills in what it brought.
  const heartRows = coalesceHeart(batch.heart);
  const sources = batch.heartSources ?? BOTH_HEART;
  const heart = pruneHeart(
    upsert(body.heart, heartRows, HEART, (old, next) => (w ? compact({ ...uncoveredHeart(old, sources), ...next }) : compact({ ...old, ...next }))),
    heartRows,
    w,
    sources,
  );
  const weight = prune(upsert(body.weight, batch.weight?.map(compact), WEIGHT), batch.weight, WEIGHT, w);
  // A hidden workout stays hidden when it is read again.
  const workouts = prune(upsert(body.workouts, batch.workouts?.map(compact), WORKOUT, (old, next) => ({ ...next, hidden: old.hidden })), batch.workouts, WORKOUT, w);
  if (steps === body.steps && sleep === body.sleep && heart === body.heart && weight === body.weight && workouts === body.workouts) return body;
  return { ...body, steps, sleep, heart, weight, workouts };
}

/** Shape-check a stored / imported body slice; older files simply lack it. */
export function normalizeBody(raw: unknown): BodyState {
  if (!raw || typeof raw !== 'object') return EMPTY_BODY;
  const b = raw as Partial<BodyState>;
  const list = <T>(xs: T[] | undefined): T[] => (Array.isArray(xs) ? xs : []);
  const sync = b.sync && typeof b.sync === 'object' ? b.sync : EMPTY_BODY.sync;
  // Sync metadata is shown on the Body tab; a file can carry anything, so only a sane time and a
  // bounded message survive.
  const lastSyncAt = typeof sync.lastSyncAt === 'number' && Number.isFinite(sync.lastSyncAt) && sync.lastSyncAt > 0 && sync.lastSyncAt < 4102444800000 ? sync.lastSyncAt : undefined;
  const lastError = typeof sync.lastError === 'string' && sync.lastError.length > 0 ? sync.lastError.slice(0, 500) : undefined;
  return {
    steps: list(b.steps),
    sleep: list(b.sleep),
    heart: list(b.heart),
    weight: list(b.weight),
    workouts: list(b.workouts).map((w) => ({ ...w, hidden: w.hidden === true })),
    sync: {
      ...(lastSyncAt !== undefined ? { lastSyncAt } : {}),
      ...(lastError !== undefined ? { lastError } : {}),
      granted: Array.isArray(sync.granted) ? sync.granted.filter((g): g is BodyRecordType => (BODY_RECORD_TYPES as readonly string[]).includes(g)) : [],
      background: sync.background === true,
    },
  };
}
