/**
 * "Re-plan on every trigger": turn the current state into an OS schedule.
 * Used by the in-app scheduler (after each state change) and by the headless
 * paths (notification buttons while the app is closed, the 3-hourly catch-up).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reducer } from '@/src/state/reducer';
import { applyAll, firedActions, type CommandContext } from '@/src/state/commands';
import { nudgePlan } from '@/src/state/selectors';
import type { TrackerState } from '@/src/state/types';
import { currentZone, newId, now } from '@/src/domain/time/clock';
import { trackingDayOf } from '@/src/domain/time/trackingDay';
import { prepare, syncPlan, type FiredRecord } from './notifications';

const DIRTY_KEY = 'dailytracker.headless.dirty.v1';

export function contextFor(state: TrackerState, nowMs = now(), zone = currentZone()): CommandContext {
  return { nowMs, zone, today: trackingDayOf(nowMs, zone, state.settings.dayBoundaryHour), newId };
}

/** Push the plan for `state` to the OS; returns the nudges that fired since the last sync. */
export async function syncStateToOs(state: TrackerState, ctx: CommandContext): Promise<FiredRecord[]> {
  const plan = state.settings.remindersEnabled ? nudgePlan(state, ctx.today, ctx.nowMs, ctx.zone) : [];
  await prepare(state.settings.tapSizeMl);
  return syncPlan(plan, ctx.nowMs);
}

/** Headless variant: sync, fold fired events into the state and return it (caller persists). */
export async function replanHeadless(state: TrackerState, ctx: CommandContext): Promise<TrackerState> {
  const fired = await syncStateToOs(state, ctx);
  const actions = firedActions(state, fired, ctx);
  actions.push({ type: 'PRUNE_EVENTS', beforeMs: ctx.nowMs - 60 * 60_000 });
  return applyAll(state, actions, reducer);
}

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
