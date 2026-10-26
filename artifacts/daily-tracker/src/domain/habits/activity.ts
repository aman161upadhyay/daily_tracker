/**
 * The records behind a habit's figures, one row each, so a wrong tap can be taken back exactly
 * (the drink logged twice from the widget, the squats counted for the wrong habit) instead of
 * rewriting the day's total. Pure: the habit page lists these; the reducer's REMOVE_LOG removes
 * one by its id.
 */
import { snackCountsFor } from '@/src/domain/habits/snackMatch';
import { SNACK_LABELS, type Habit, type MindKind, type Units } from '@/src/domain/models';
import { formatVolume, habitAmountText } from '@/src/domain/time/format';
import type { TrackerState } from '@/src/state/types';

export type ActivityLog = 'entry' | 'water' | 'snack' | 'mind';

export interface ActivityRecord {
  log: ActivityLog;
  id: string;
  /** Tracking day the record counts for. */
  day: string;
  /** The instant shown next to it (a session: when it ended). */
  at: number;
  /** What the row says: "250 ml", "10 squats", "10 min meditation", "Done", "+20 pages". */
  amount: string;
  /** Where it came from when not a tap in the app: "widget", "reminder", "Health Connect", "Sugar Shield". */
  via?: string;
  /** False for records another system owns (Health Connect entries come back with the next import). */
  removable: boolean;
}

const MIND_WORDS: Record<MindKind, string> = { MEDITATION: 'meditation', BREATHING: 'breathing' };

function seconds(n: number): string {
  if (n < 60) return `${n} s`;
  const min = Math.round(n / 60);
  return `${min} min`;
}

/** What each record in `days` (tracking days) says for this habit, newest first. */
export function habitActivity(state: TrackerState, habit: Habit, days: readonly string[], units: Units): ActivityRecord[] {
  const wanted = new Set(days);
  const out: ActivityRecord[] = [];
  if (habit.presetId === 'water') {
    for (const w of state.water) {
      if (!wanted.has(w.day)) continue;
      const f = formatVolume(w.ml, units);
      const auto = w.source === 'AUTO_HC';
      out.push({
        log: 'water',
        id: w.id,
        day: w.day,
        at: w.at,
        amount: `${f.value} ${f.unit}`,
        via: w.source === 'AUTO_WIDGET' ? 'widget' : auto ? 'Health Connect' : undefined,
        // An imported drink follows the other app: removed here, the next read adds it back.
        removable: !auto,
      });
    }
  } else if (habit.snackType) {
    for (const s of state.snacks) {
      if (!wanted.has(s.day) || !snackCountsFor(habit, s)) continue;
      const meta = SNACK_LABELS[s.type];
      const word = meta.label.toLowerCase();
      const amount = s.reps !== undefined ? `${s.reps} ${word}` : s.seconds !== undefined ? `${seconds(s.seconds)} ${word}` : meta.label;
      out.push({
        log: 'snack',
        id: s.id,
        day: s.day,
        at: s.at,
        amount,
        via: s.trigger === 'NUDGE' ? 'reminder' : s.trigger === 'WIDGET' ? 'widget' : s.trigger === 'SUGAR_SHIELD' ? 'Sugar Shield' : undefined,
        removable: true,
      });
    }
  } else if (habit.mindKind) {
    for (const m of state.mind) {
      if (!wanted.has(m.day) || m.kind !== habit.mindKind) continue;
      out.push({ log: 'mind', id: m.id, day: m.day, at: m.endAt, amount: `${m.minutes} min ${MIND_WORDS[m.kind]}`, removable: true });
    }
  } else {
    for (const e of state.entries) {
      if (!wanted.has(e.day) || e.habitId !== habit.id) continue;
      const amount = habit.type === 'YES_NO' ? (e.value > 0 ? 'Done' : 'Not done') : `+${habitAmountText(habit, e.value, units)}`;
      const auto = e.source === 'AUTO_HC';
      out.push({
        log: 'entry',
        id: e.id,
        day: e.day,
        at: e.at,
        amount,
        via: auto ? 'Health Connect' : e.source === 'AUTO_WIDGET' ? 'widget' : undefined,
        removable: !auto,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}
