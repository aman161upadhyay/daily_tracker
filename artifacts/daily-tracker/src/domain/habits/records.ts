import type { Habit, HabitEntry, MindSession, MovementSnack, WaterEntry } from '@/src/domain/models';
import { snackCountsFor } from '@/src/domain/habits/snackMatch';
import type { TrackerState } from '@/src/state/types';

/** One record of one of the four logs, with the log it belongs to, so it can be removed and put back exactly. */
export type LogRecord =
  | { log: 'entry'; record: HabitEntry }
  | { log: 'water'; record: WaterEntry }
  | { log: 'snack'; record: MovementSnack }
  | { log: 'mind'; record: MindSession };

export type LogName = LogRecord['log'];

/** The most records one Undo may put back (a cleared day of the busiest habit is far below this). */
export const MAX_RESTORE_RECORDS = 1000;

/** The record with this id in this log, or null. */
export function findRecord(state: TrackerState, log: LogName, id: string): LogRecord | null {
  switch (log) {
    case 'water': {
      const r = state.water.find((w) => w.id === id);
      return r ? { log, record: r } : null;
    }
    case 'snack': {
      const r = state.snacks.find((s) => s.id === id);
      return r ? { log, record: r } : null;
    }
    case 'mind': {
      const r = state.mind.find((m) => m.id === id);
      return r ? { log, record: r } : null;
    }
    case 'entry': {
      const r = state.entries.find((e) => e.id === id);
      return r ? { log, record: r } : null;
    }
  }
  return null;
}

/**
 * Every record this habit counts on `day` — the same rule the activity list and the counts use
 * (the Sugar Shield rule decides which snacks belong to a movement habit). "Clear day" removes
 * exactly this list, so an Undo can put exactly it back.
 */
export function dayRecords(state: TrackerState, habit: Habit, day: string): LogRecord[] {
  if (habit.presetId === 'water') return state.water.filter((w) => w.day === day).map((record) => ({ log: 'water', record }));
  if (habit.snackType) return state.snacks.filter((s) => s.day === day && snackCountsFor(habit, s)).map((record) => ({ log: 'snack', record }));
  if (habit.mindKind) return state.mind.filter((m) => m.day === day && m.kind === habit.mindKind).map((record) => ({ log: 'mind', record }));
  return state.entries.filter((e) => e.day === day && e.habitId === habit.id).map((record) => ({ log: 'entry', record }));
}

/** Habits whose entries a restore may bring back: an entry needs its habit, the other logs stand on their own. */
export function restorable(state: TrackerState, records: readonly LogRecord[]): LogRecord[] {
  const habits = new Set(state.habits.map((h) => h.id));
  const present = new Set<string>();
  for (const w of state.water) present.add(`water:${w.id}`);
  for (const s of state.snacks) present.add(`snack:${s.id}`);
  for (const m of state.mind) present.add(`mind:${m.id}`);
  for (const e of state.entries) present.add(`entry:${e.id}`);
  const seen = new Set<string>();
  const out: LogRecord[] = [];
  for (const r of records) {
    if (out.length >= MAX_RESTORE_RECORDS) break;
    const key = `${r.log}:${r.record.id}`;
    if (present.has(key) || seen.has(key)) continue; // already back (or listed twice): nothing to do
    if (r.log === 'entry' && !habits.has(r.record.habitId)) continue; // the habit is gone (deleted, or a different state after an erase)
    seen.add(key);
    out.push(r);
  }
  return out;
}
