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

/** A headless writer changed the database; the running app must reload before it writes again. */
export async function markHeadlessWrite(): Promise<void> {
  await AsyncStorage.setItem(DIRTY_KEY, String(Date.now()));
}

export async function consumeHeadlessWrite(): Promise<boolean> {
  const v = await AsyncStorage.getItem(DIRTY_KEY);
  if (!v) return false;
  await AsyncStorage.removeItem(DIRTY_KEY);
  return true;
}
