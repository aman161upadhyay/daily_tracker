/**
 * "Re-plan on every trigger": turn the current state into an OS schedule.
 * Used by the in-app scheduler (after each state change) and by the headless
 * paths (notification buttons while the app is closed, the 3-hourly catch-up).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reducer } from '@/src/state/reducer';
import { applyAll, firedActions, type CommandContext } from '@/src/state/commands';
import type { LiveStore } from '@/src/state/liveStore';
import { nudgePlan } from '@/src/state/selectors';
import type { TrackerState } from '@/src/state/types';
import { currentZone, newId, now } from '@/src/domain/time/clock';
import { trackingDayOf } from '@/src/domain/time/trackingDay';
import type { Action } from '@/src/state/reducer';
import { acknowledgeDeliveries, firedSinceLastSync, prepare, SupersededError, syncPlan, type FiredRecord } from './notifications';

const DIRTY_KEY = 'dailytracker.headless.dirty.v1';

export function contextFor(state: TrackerState, nowMs = now(), zone = currentZone()): CommandContext {
  return { nowMs, zone, today: trackingDayOf(nowMs, zone, state.settings.dayBoundaryHour), newId };
}

/**
 * Push the plan for `state` to the OS; returns the nudges that fired since the last sync. `still`
 * is the caller's validity (see syncPlan): checked after every await on the way to the OS.
 */
export async function syncStateToOs(state: TrackerState, ctx: CommandContext, still: () => boolean = () => true): Promise<FiredRecord[]> {
  const plan = state.settings.remindersEnabled ? nudgePlan(state, ctx.today, ctx.nowMs, ctx.zone) : [];
  await prepare(state.settings.tapSizeMl, state.settings.units);
  if (!still()) throw new SupersededError();
  return syncPlan(plan, ctx.nowMs, still);
}

/** What a re-plan found: the deliveries folded into the state, and whether that state is saved. */
export interface Reconciled {
  delivered: FiredRecord[];
  /** True when every fold went through a store that confirmed the save (the live store does). */
  persisted: boolean;
}

// One reconcile at a time per runtime. Two of them interleaving (the in-app scheduler's debounced
// sync and a foreground re-sync, or a headless re-plan while the app is alive) would both read
// the deliveries, and the second would plan from a state the first had not folded them into yet.
let reconcileQueue: Promise<unknown> = Promise.resolve();

/**
 * The one re-plan sequence, over whatever holds the state: first write down what the OS delivered
 * since the last sync, then plan from that state, then record anything that rang in between.
 * Planning before the deliveries are known treats the delivered slots as still free and spends
 * the daily cap twice (the plan would re-offer a slot the person just saw as a new one).
 *
 * The deliveries stay in the service's journal until `acknowledgeDeliveries` is called for them;
 * this does so itself when the folds confirmed the save, and otherwise leaves it to the caller,
 * which knows when the state it holds is on disk (see replanHeadless).
 */
export function reconcileAndSync(
  current: () => TrackerState,
  apply: (build: (s: TrackerState) => Action[]) => Promise<unknown>,
  ctx: CommandContext,
  /** The caller's validity, carried to the OS boundary: false once its owner is gone or the state was replaced. */
  still: () => boolean = () => true,
): Promise<Reconciled> {
  const job = async (): Promise<Reconciled> => {
    if (!still()) throw new SupersededError();
    let persisted = true;
    // The live store's apply resolves to { persisted }; the headless in-memory fold resolves to nothing.
    const fold = async (build: (s: TrackerState) => Action[]) => {
      const result = (await apply(build)) as { persisted?: unknown } | null | undefined;
      if (!result || result.persisted !== true) persisted = false;
    };
    const delivered = await firedSinceLastSync(ctx.nowMs);
    if (delivered.length > 0) await fold((s) => firedActions(s, delivered, ctx));
    const fired = await syncStateToOs(current(), ctx, still);
    await fold((s) => [...firedActions(s, fired, ctx), { type: 'PRUNE_EVENTS', beforeMs: ctx.nowMs - 60 * 60_000 }]);
    const all = [...delivered, ...fired];
    if (persisted && all.length > 0) await acknowledgeDeliveries(all);
    return { delivered: all, persisted };
  };
  const run = reconcileQueue.then(job, job);
  reconcileQueue = run.catch(() => undefined);
  return run;
}

/**
 * Headless variant: sync and fold fired events into the state in memory. The caller persists the
 * returned state and then acknowledges `delivered` (`acknowledgeDeliveries`); a caller that
 * drops the state instead (the app came alive and is the writer now) acknowledges nothing, and
 * the deliveries are folded again by whoever writes next.
 */
export async function replanHeadless(state: TrackerState, ctx: CommandContext): Promise<{ next: TrackerState; delivered: FiredRecord[] }> {
  let next = state;
  const { delivered } = await reconcileAndSync(
    () => next,
    async (build) => {
      next = applyAll(next, build(next), reducer);
    },
    ctx,
  );
  return { next, delivered };
}

/**
 * The same re-plan through the running app's store: for a headless task that
 * found the app alive on its runtime. Awaited by the task, so the OS schedule
 * is current before the task resolves — Android may freeze the app right after,
 * before the in-app scheduler's own debounced sync gets its turn. Returns the
 * newest state. The store confirms its saves, so the deliveries are acknowledged
 * here (or kept for a replay when a save failed).
 */
export async function replanLive(live: LiveStore, ctx: CommandContext): Promise<TrackerState> {
  // A replace on screen that is not in the database yet: the record beside the state still
  // belongs to the old state. The app's own scheduler re-plans once the replace committed.
  if (live.replacePending()) return live.current();
  // Fenced like the in-app scheduler: a fold conceived before a replace must not land after it,
  // and neither must its plan reach the OS. Nor may the plan of a store whose provider was retired
  // meanwhile (an error-boundary reset): its replacement owns the schedule now.
  const seq = live.replaceSeq();
  const still = () => live.alive() && live.replaceSeq() === seq;
  await reconcileAndSync(() => live.current(), (build) => (still() ? live.apply(build) : Promise.reject(new SupersededError())), ctx, still);
  return live.current();
}

export { acknowledgeDeliveries };

/**
 * Headless writes (notification buttons, widget taps, the background re-plan)
 * bump a revision number. The running app remembers the revision it last
 * loaded and reloads when the number moved. A counter, not a flag: a flag
 * that is read-then-cleared loses the write that lands between the read and
 * the clear.
 */
let revisionQueue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

export async function markHeadlessWrite(): Promise<void> {
  const bump = async () => {
    const current = await headlessRevision();
    await AsyncStorage.setItem(DIRTY_KEY, String(current + 1));
  };
  const run = revisionQueue.then(bump, bump);
  revisionQueue = run.catch(() => undefined);
  await run;
  // Same runtime (the app is alive while a headless task runs): tell the provider right away
  // instead of waiting for the next foreground or 30-second tick.
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      console.warn('Headless write listener failed', err);
    }
  }
}

/** Called after every headless write that happens on this runtime. Returns the unsubscribe. */
export function onHeadlessWrite(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current revision (0 when nothing was ever written headlessly). */
export async function headlessRevision(): Promise<number> {
  const v = await AsyncStorage.getItem(DIRTY_KEY);
  const n = v === null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}
