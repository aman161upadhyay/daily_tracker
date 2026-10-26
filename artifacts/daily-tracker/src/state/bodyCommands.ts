/**
 * What a Health Connect read does to the habits ("auto-ticks"), as reducer
 * actions. Rules, in the order the user would state them:
 *
 *  - Steps fill the Steps habit for the same day. A total you typed yourself
 *    stays; the automatic entry is replaced, never added to.
 *  - A strength-type workout of 15+ minutes ticks Strength session for its
 *    day, once, and only if nothing was logged for that day yet.
 *  - A drink logged in another app becomes a water entry once (by record id),
 *    unless you logged the same drink here within five minutes.
 */
import { isStrengthExercise } from '@/src/domain/body/exerciseTypes';
import type { BodyBatch } from '@/src/domain/body/types';
import type { HabitEntry, WaterEntry } from '@/src/domain/models';
import { instantOf, trackingDayOf } from '@/src/domain/time/trackingDay';
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
  if (stepsHabit && batch.steps) {
    for (const day of batch.steps) {
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

  const strength = habits.find((h) => h.presetId === 'strength-session');
  if (strength && batch.workouts) {
    const ticked = new Set(state.entries.filter((e) => e.habitId === strength.id).map((e) => e.day));
    for (const w of [...batch.workouts].sort((a, b) => a.startAt - b.startAt)) {
      if (w.hidden || !ticksStrength(w.type, w.minutes) || ticked.has(w.day)) continue;
      ticked.add(w.day);
      actions.push({ type: 'ADD_ENTRY', entry: { id: ctx.newId(), habitId: strength.id, day: w.day, at: w.endAt, zone: ctx.zone, value: 1, source: 'AUTO_HC' } });
    }
  }

  if (batch.hydration) {
    const seen = new Set(state.water.map((w) => w.externalId).filter((x): x is string => !!x));
    const manual = state.water.filter((w) => w.source === 'MANUAL' || w.source === 'AUTO_WIDGET');
    for (const h of batch.hydration) {
      if (h.ml <= 0 || seen.has(h.id)) continue;
      seen.add(h.id);
      const duplicate = manual.some((w) => Math.abs(w.at - h.at) <= SAME_DRINK_WINDOW_MS && Math.abs(w.ml - h.ml) <= 10);
      if (duplicate) continue;
      const entry: WaterEntry = {
        id: ctx.newId(),
        at: h.at,
        zone: ctx.zone,
        day: trackingDayOf(h.at, ctx.zone, state.settings.dayBoundaryHour),
        ml: Math.round(h.ml),
        source: 'AUTO_HC',
        externalId: h.id,
      };
      actions.push({ type: 'ADD_WATER', entry });
    }
  }

  return actions;
}
