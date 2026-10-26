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

export function mergeBody(body: BodyState, batch: BodyBatch): BodyState {
  const w = batch.window;
  const steps = prune(upsert(body.steps, batch.steps?.map(compact), STEP), batch.steps, STEP, w);
  const sleep = prune(upsert(body.sleep, batch.sleep?.map(compact), SLEEP), batch.sleep, SLEEP, w);
  // Heart days come from two reads (samples aggregate, resting records); keep whichever fields each one has.
  const heart = prune(upsert(body.heart, batch.heart?.map(compact), HEART, (old, next) => compact({ ...old, ...next })), batch.heart, HEART, w);
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
  return {
    steps: list(b.steps),
    sleep: list(b.sleep),
    heart: list(b.heart),
    weight: list(b.weight),
    workouts: list(b.workouts).map((w) => ({ ...w, hidden: w.hidden === true })),
    sync: {
      ...(sync.lastSyncAt !== undefined ? { lastSyncAt: sync.lastSyncAt } : {}),
      ...(sync.lastError !== undefined ? { lastError: sync.lastError } : {}),
      granted: Array.isArray(sync.granted) ? sync.granted.filter((g): g is BodyRecordType => (BODY_RECORD_TYPES as readonly string[]).includes(g)) : [],
      background: sync.background === true,
    },
  };
}
