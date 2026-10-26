/**
 * What a Health Connect read does to the habits ("auto-ticks"), as reducer
 * actions. Rules, in the order the user would state them:
 *
 *  - Steps fill the Steps habit for the same tracking day. A total you typed
 *    yourself stays; the automatic entry is replaced, never added to.
 *  - A strength-type workout of 15+ minutes ticks Strength session for its
 *    day, once, and only if nothing was logged for that day yet. A tick the
 *    sync made goes away again when its workout was deleted (or hidden here).
 *  - A drink logged in another app becomes a water entry once (by record id),
 *    unless you logged the same drink here within five minutes. Edited
 *    upstream → updated here; deleted upstream → removed here. Drinks you
 *    logged yourself are never touched.
 *
 * Removals happen only for a complete read (`batch.window` set), so a partly
 * failed read can never make records "disappear".
 */
import { isStrengthExercise } from '@/src/domain/body/exerciseTypes';
import { mergeBody } from '@/src/domain/body/merge';
import type { BodyBatch } from '@/src/domain/body/types';
import type { HabitEntry, WaterEntry } from '@/src/domain/models';
import { addDays, instantOf, trackingDayOf } from '@/src/domain/time/trackingDay';
import type { CommandContext } from './commands';
import type { Action } from './reducer';
import { activeHabits } from './selectors';
import type { TrackerState } from './types';

export const STRENGTH_MIN_MINUTES = 15;
const SAME_DRINK_WINDOW_MS = 5 * 60_000;

/** Generic "Workout" sessions (type 0) count too: most gym apps export them that way. */
export function ticksStrength(type: number, minutes: number): boolean {
  return minutes >= STRENGTH_MIN_MINUTES && (type === 0 || isStrengthExercise(type));
}

export function autoTickActions(state: TrackerState, batch: BodyBatch, ctx: CommandContext): Action[] {
  const actions: Action[] = [];
  const habits = activeHabits(state);

  const stepsHabit = habits.find((h) => h.presetId === 'steps');
  let stepDays = batch.habitSteps ?? batch.steps;
  if (stepDays && batch.window) {
    // A complete read answers for every day of its window: a day it returned nothing for has no
    // steps any more (the records were deleted, or their source app disconnected), so an automatic
    // total still standing for it is cleared below instead of outliving the data it mirrored.
    const returned = new Set(stepDays.map((d) => d.day));
    const filled = [...stepDays];
    for (let day = batch.window.fromDay; day <= batch.window.toDay; day = addDays(day, 1)) {
      if (!returned.has(day)) filled.push({ day, steps: 0 });
    }
    stepDays = filled;
  }
  if (stepsHabit && stepDays) {
    for (const day of stepDays) {
      const existing = state.entries.filter((e) => e.habitId === stepsHabit.id && e.day === day.day);
      if (existing.some((e) => e.source === 'MANUAL')) continue;
      const autoRows = existing.filter((e) => e.source !== 'MANUAL');
      const autoTotal = autoRows.reduce((a, e) => a + e.value, 0);
      const onlyHc = autoRows.every((e) => e.source === 'AUTO_HC');
      if (onlyHc && autoTotal === day.steps && (day.steps > 0 || existing.length === 0)) continue;
      if (day.steps <= 0) {
        if (existing.length > 0) actions.push({ type: 'SET_AUTO_ENTRY', habitId: stepsHabit.id, day: day.day });
        continue;
      }
      const at = day.day === ctx.today ? ctx.nowMs : instantOf(day.day, 12 * 60, ctx.zone);
      const entry: HabitEntry = { id: ctx.newId(), habitId: stepsHabit.id, day: day.day, at, zone: ctx.zone, value: day.steps, source: 'AUTO_HC' };
      actions.push({ type: 'SET_AUTO_ENTRY', habitId: stepsHabit.id, day: day.day, entry });
    }
  }

  const window = batch.window;
  const inWindow = (day: string) => window !== undefined && day >= window.fromDay && day <= window.toDay;

  const strength = habits.find((h) => h.presetId === 'strength-session');
  if (strength && batch.workouts) {
    // Hidden workouts are the user's "that was not a session": they neither tick nor keep a tick.
    const hidden = new Set(state.body.workouts.filter((w) => w.hidden).map((w) => w.id));
    const qualifies = (w: { id: string; hidden?: boolean; type: number; minutes: number }) => !w.hidden && !hidden.has(w.id) && ticksStrength(w.type, w.minutes);
    const qualifying = new Set(batch.workouts.filter(qualifies).map((w) => w.day));
    // A workout whose date changed upstream (same record, new day) leaves its old day behind: that
    // day is judged again, even outside the read window, against everything still known about it.
    const byId = new Map(state.body.workouts.map((w) => [w.id, w]));
    const movedFrom = new Set<string>();
    for (const w of batch.workouts) {
      const prev = byId.get(w.id);
      if (prev && prev.day !== w.day) movedFrom.add(prev.day);
    }
    const stillQualifying = movedFrom.size > 0 ? new Set(mergeBody(state.body, batch).workouts.filter(qualifies).map((w) => w.day)) : qualifying;
    const ticked = new Set<string>();
    for (const e of state.entries) {
      if (e.habitId !== strength.id) continue;
      if (e.source === 'AUTO_HC' && ((inWindow(e.day) && !qualifying.has(e.day)) || (movedFrom.has(e.day) && !stillQualifying.has(e.day)))) {
        actions.push({ type: 'REMOVE_LOG', log: 'entry', id: e.id });
        continue;
      }
      ticked.add(e.day);
    }
    for (const w of [...batch.workouts].sort((a, b) => a.startAt - b.startAt)) {
      if (!qualifying.has(w.day) || !ticksStrength(w.type, w.minutes) || w.hidden || hidden.has(w.id) || ticked.has(w.day)) continue;
      ticked.add(w.day);
      actions.push({ type: 'ADD_ENTRY', entry: { id: ctx.newId(), habitId: strength.id, day: w.day, at: w.endAt, zone: ctx.zone, value: 1, source: 'AUTO_HC' } });
    }
  }

  if (batch.hydration) {
    const boundary = state.settings.dayBoundaryHour;
    // The rows already imported, one per upstream record (a duplicate of the same record is noise).
    const existingByExternal = new Map<string, WaterEntry>();
    for (const w of state.water) {
      if (w.source !== 'AUTO_HC' || !w.externalId) continue;
      if (existingByExternal.has(w.externalId)) actions.push({ type: 'REMOVE_LOG', log: 'water', id: w.id });
      else existingByExternal.set(w.externalId, w);
    }
    const upstream = batch.hydration.filter((h) => h.ml > 0).map((h) => ({ ...h, ml: Math.round(h.ml) }));
    const inBatch = new Set(batch.hydration.map((h) => h.id));
    const stillThere = new Set(upstream.map((h) => h.id));
    // A drink the person logged here (by hand or from the widget) is the record of that drink; an
    // imported copy of it — the other app's entry a minute away — is not a second glass. Each
    // manual row stands for at most one import, the nearest in time, judged on the record as the
    // other app has it now (an entry moved an hour away upstream is a drink of its own again).
    const twins = twinImports(upstream, state.water);
    for (const h of upstream.sort((x, y) => x.at - y.at || x.id.localeCompare(y.id))) {
      const current = existingByExternal.get(h.id);
      if (twins.has(h.id)) {
        if (current) actions.push({ type: 'REMOVE_LOG', log: 'water', id: current.id });
        continue;
      }
      if (current) {
        // Edited in the other app: same record, new amount or time. The row keeps the zone it was
        // recorded in, so its day stays the one that clock would give.
        if (h.ml !== current.ml || h.at !== current.at) {
          actions.push({ type: 'REMOVE_LOG', log: 'water', id: current.id });
          actions.push({ type: 'ADD_WATER', entry: { ...current, at: h.at, day: trackingDayOf(h.at, current.zone, boundary), ml: h.ml } });
        }
        continue;
      }
      const entry: WaterEntry = { id: ctx.newId(), at: h.at, zone: ctx.zone, day: trackingDayOf(h.at, ctx.zone, boundary), ml: h.ml, source: 'AUTO_HC', externalId: h.id };
      actions.push({ type: 'ADD_WATER', entry });
    }
    for (const [externalId, w] of existingByExternal) {
      // Deleted in the other app (or emptied to nothing), as far as this read can tell.
      const gone = inBatch.has(externalId) ? !stillThere.has(externalId) : inWindow(w.day);
      if (gone) actions.push({ type: 'REMOVE_LOG', log: 'water', id: w.id });
    }
  }

  return actions;
}

/**
 * The upstream records that are copies of a drink logged here: each manual or widget row is paired
 * with at most one import within `SAME_DRINK_WINDOW_MS` and 10 ml, closest pairs first.
 */
export function twinImports(upstream: readonly { id: string; at: number; ml: number }[], water: readonly WaterEntry[]): Set<string> {
  const manual = water.filter((w) => w.source === 'MANUAL' || w.source === 'AUTO_WIDGET').sort((a, b) => a.at - b.at);
  const pairs: { gap: number; importId: string; manualIndex: number }[] = [];
  for (const h of upstream) {
    // Binary search for the first manual row inside the window, then walk while rows stay inside it.
    let lo = 0;
    let hi = manual.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (manual[mid]!.at < h.at - SAME_DRINK_WINDOW_MS) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < manual.length && manual[i]!.at <= h.at + SAME_DRINK_WINDOW_MS; i++) {
      if (Math.abs(manual[i]!.ml - h.ml) <= 10) pairs.push({ gap: Math.abs(manual[i]!.at - h.at), importId: h.id, manualIndex: i });
    }
  }
  pairs.sort((a, b) => a.gap - b.gap || a.manualIndex - b.manualIndex || a.importId.localeCompare(b.importId));
  const taken = new Set<number>();
  const twins = new Set<string>();
  for (const p of pairs) {
    if (taken.has(p.manualIndex) || twins.has(p.importId)) continue;
    taken.add(p.manualIndex);
    twins.add(p.importId);
  }
  return twins;
}
