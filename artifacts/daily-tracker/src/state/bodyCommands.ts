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
    const byExternal = new Map(batch.hydration.map((h) => [h.id, h]));
    const seen = new Set<string>();
    const manual = state.water.filter((w) => w.source === 'MANUAL' || w.source === 'AUTO_WIDGET');
    for (const w of state.water) {
      if (!w.externalId) continue;
      const upstream = byExternal.get(w.externalId);
      if (upstream) {
        seen.add(w.externalId);
        // Edited in the other app: same record, new amount or time.
        if (w.source === 'AUTO_HC' && (Math.round(upstream.ml) !== w.ml || upstream.at !== w.at)) {
          actions.push({ type: 'REMOVE_LOG', log: 'water', id: w.id });
          actions.push({
            type: 'ADD_WATER',
            entry: { ...w, at: upstream.at, day: trackingDayOf(upstream.at, ctx.zone, boundary), ml: Math.round(upstream.ml) },
          });
        }
      } else if (w.source === 'AUTO_HC' && inWindow(w.day)) {
        // Deleted in the other app.
        actions.push({ type: 'REMOVE_LOG', log: 'water', id: w.id });
      }
    }
    for (const h of batch.hydration) {
      if (h.ml <= 0 || seen.has(h.id)) continue;
      seen.add(h.id);
      const duplicate = manual.some((w) => Math.abs(w.at - h.at) <= SAME_DRINK_WINDOW_MS && Math.abs(w.ml - h.ml) <= 10);
      if (duplicate) continue;
      const entry: WaterEntry = {
        id: ctx.newId(),
        at: h.at,
        zone: ctx.zone,
        day: trackingDayOf(h.at, ctx.zone, boundary),
        ml: Math.round(h.ml),
        source: 'AUTO_HC',
        externalId: h.id,
      };
      actions.push({ type: 'ADD_WATER', entry });
    }
  }

  return actions;
}
