import { mergeBody } from '@/src/domain/body/merge';
import { EMPTY_BODY, type BodyBatch, type BodySync } from '@/src/domain/body/types';
import { isEmptyLog } from '@/src/domain/cycle/symptoms';
import { applyPeriodEnd, applyPeriodStart, closeOlderOpenSpans, normalizeHistory } from '@/src/domain/cycle/timeline';
import type { CycleDayLog, Habit, HabitEntry, HabitRule, MindSession, MovementSnack, NudgeEvent, NudgePolicy, PeriodSpan, ScheduledEvent, Settings, WaterEntry } from '@/src/domain/models';
import type { TrackerState } from './types';
import { snackCountsFor } from '@/src/domain/habits/snackMatch';
import { dayRecords, restorable, type LogRecord } from '@/src/domain/habits/records';

export type Action =
  | { type: 'HYDRATE'; state: TrackerState }
  | { type: 'REPLACE'; state: TrackerState }
  | { type: 'ADD_ENTRY'; entry: HabitEntry }
  | { type: 'TOGGLE_ENTRY'; entry: HabitEntry }
  | { type: 'REMOVE_LAST_ENTRY'; habitId: string; day: string }
  | { type: 'ADD_WATER'; entry: WaterEntry }
  | { type: 'UNDO_WATER'; day: string }
  | { type: 'LOG_SNACK'; snack: MovementSnack }
  /** Several snacks at once (a backfilled count): one state change, not one per snack. */
  | { type: 'LOG_SNACKS'; snacks: MovementSnack[] }
  | { type: 'UNDO_SNACK'; day: string; habit: Habit }
  | { type: 'LOG_MIND'; session: MindSession }
  /** Delete one logged item by id (water entries list, undo a backfill). */
  | { type: 'REMOVE_LOG'; log: 'entry' | 'water' | 'snack' | 'mind'; id: string }
  /** Clear a habit's logs on one day before writing a backfilled total. */
  | { type: 'CLEAR_DAY'; habit: Habit; day: string }
  /** Put removed records back exactly (an Undo); records already present, or whose habit is gone, are skipped. */
  | { type: 'RESTORE_LOGS'; records: LogRecord[] }
  | { type: 'ADD_HABIT'; habit: Habit; rule: HabitRule; policy: NudgePolicy }
  /** Permanent delete: the habit, its rules, policy and logs. */
  | { type: 'DELETE_HABIT'; id: string }
  | { type: 'UPDATE_HABIT'; id: string; patch: Partial<Omit<Habit, 'id' | 'type'>> }
  | { type: 'SET_RULE'; rule: HabitRule }
  /** Drop one rule version (a rhythm planned for later that was called off); a habit always keeps at least one. */
  | { type: 'REMOVE_RULE'; habitId: string; effectiveFrom: string }
  | { type: 'SET_POLICY'; policy: NudgePolicy }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'SNOOZE'; untilMs: number }
  | { type: 'SWAP'; day: string }
  /** Record what happened to a planned nudge; events older than `keepFromDay` are dropped. */
  | { type: 'NUDGE_EVENT'; event: NudgeEvent; keepFromDay: string }
  | { type: 'SCHEDULE_EVENT'; event: ScheduledEvent }
  | { type: 'REMOVE_EVENT'; id: string }
  /** Drop one-off events that are already in the past. */
  | { type: 'PRUNE_EVENTS'; beforeMs: number }
  /** Log a period start; `today` bounds it (no future starts). Moves a start that follows within 7 days. */
  | { type: 'PERIOD_START'; day: string; today: string }
  | { type: 'PERIOD_END'; day: string }
  /** Edit one span by its current start (move it, set/clear the end, exclude it from predictions). */
  | { type: 'UPDATE_PERIOD'; start: string; patch: { start?: string; end?: string | null; excluded?: boolean } }
  | { type: 'DELETE_PERIOD'; start: string }
  /** Upsert the day sheet for a calendar day; an empty log deletes the row. */
  | { type: 'SET_CYCLE_LOG'; log: CycleDayLog }
  /** Forget every period and day log (settings and reminders stay). */
  | { type: 'CLEAR_CYCLE' }
  /** Fold a Health Connect read into the body mirrors. */
  | { type: 'IMPORT_BODY'; batch: BodyBatch }
  /** Replace the automatic (Health Connect) entries of a habit-day with `entry`, or remove them. */
  | { type: 'SET_AUTO_ENTRY'; habitId: string; day: string; entry?: HabitEntry }
  | { type: 'SET_WORKOUT_HIDDEN'; id: string; hidden: boolean }
  | { type: 'BODY_SYNC'; patch: Partial<BodySync> }
  /** Forget everything imported from Health Connect (mirrors, automatic entries, imported drinks). */
  | { type: 'CLEAR_BODY' };

function removeLast<T>(items: T[], match: (x: T) => boolean, order: (x: T) => number): T[] {
  let idx = -1;
  let best = -Infinity;
  items.forEach((x, i) => {
    if (match(x) && order(x) >= best) {
      best = order(x);
      idx = i;
    }
  });
  if (idx < 0) return items;
  return items.filter((_, i) => i !== idx);
}

export function reducer(state: TrackerState, action: Action): TrackerState {
  switch (action.type) {
    case 'HYDRATE':
    case 'REPLACE':
      return action.state;

    case 'ADD_ENTRY': {
      const e = action.entry;
      // Manual beats automatic: a hand-logged value replaces what Health Connect filled in for that day.
      const kept = e.source === 'MANUAL' ? state.entries.filter((x) => !(x.habitId === e.habitId && x.day === e.day && x.source === 'AUTO_HC')) : state.entries;
      return { ...state, entries: [...kept, e] };
    }

    case 'TOGGLE_ENTRY': {
      const { habitId, day } = action.entry;
      const exists = state.entries.some((e) => e.habitId === habitId && e.day === day);
      return exists
        ? { ...state, entries: state.entries.filter((e) => !(e.habitId === habitId && e.day === day)) }
        : { ...state, entries: [...state.entries, action.entry] };
    }

    case 'REMOVE_LAST_ENTRY':
      return {
        ...state,
        entries: removeLast(state.entries, (e) => e.habitId === action.habitId && e.day === action.day, (e) => e.at),
      };

    case 'ADD_WATER':
      return { ...state, water: [...state.water, action.entry] };

    case 'UNDO_WATER':
      return { ...state, water: removeLast(state.water, (w) => w.day === action.day, (w) => w.at) };

    case 'LOG_SNACK':
      return { ...state, snacks: [...state.snacks, action.snack] };

    case 'LOG_SNACKS':
      return action.snacks.length === 0 ? state : { ...state, snacks: [...state.snacks, ...action.snacks] };

    case 'UNDO_SNACK':
      // The same ownership rule as the count: the undo removes the newest snack the habit counts.
      return {
        ...state,
        snacks: removeLast(
          state.snacks,
          (s) => s.day === action.day && snackCountsFor(action.habit, s),
          (s) => s.at,
        ),
      };

    case 'LOG_MIND':
      return { ...state, mind: [...state.mind, action.session] };

    case 'REMOVE_LOG': {
      const keep = <T extends { id: string }>(xs: T[]) => xs.filter((x) => x.id !== action.id);
      switch (action.log) {
        case 'entry':
          return { ...state, entries: keep(state.entries) };
        case 'water':
          return { ...state, water: keep(state.water) };
        case 'snack':
          return { ...state, snacks: keep(state.snacks) };
        case 'mind':
          return { ...state, mind: keep(state.mind) };
      }
      return state;
    }

    case 'CLEAR_DAY': {
      // Exactly the records the habit counts that day (one rule, shared with the activity list and Undo).
      const gone = new Set(dayRecords(state, action.habit, action.day).map((r) => r.record.id));
      if (gone.size === 0) return state;
      const h = action.habit;
      if (h.presetId === 'water') return { ...state, water: state.water.filter((w) => !gone.has(w.id)) };
      if (h.snackType) return { ...state, snacks: state.snacks.filter((s) => !gone.has(s.id)) };
      if (h.mindKind) return { ...state, mind: state.mind.filter((m) => !gone.has(m.id)) };
      return { ...state, entries: state.entries.filter((e) => !gone.has(e.id)) };
    }

    case 'RESTORE_LOGS': {
      const back = restorable(state, action.records);
      if (back.length === 0) return state;
      const water = back.flatMap((r) => (r.log === 'water' ? [r.record] : []));
      const snacks = back.flatMap((r) => (r.log === 'snack' ? [r.record] : []));
      const mind = back.flatMap((r) => (r.log === 'mind' ? [r.record] : []));
      const entries = back.flatMap((r) => (r.log === 'entry' ? [r.record] : []));
      // The same precedence as logging by hand: a manual record coming back replaces what Health
      // Connect filled in for that day while it was gone (a sync can land inside the Undo window),
      // so the day does not count both.
      const manualDays = new Set(entries.filter((e) => e.source === 'MANUAL').map((e) => `${e.habitId}|${e.day}`));
      const keptEntries = manualDays.size ? state.entries.filter((x) => !(x.source === 'AUTO_HC' && manualDays.has(`${x.habitId}|${x.day}`))) : state.entries;
      return {
        ...state,
        water: water.length ? [...state.water, ...water] : state.water,
        snacks: snacks.length ? [...state.snacks, ...snacks] : state.snacks,
        mind: mind.length ? [...state.mind, ...mind] : state.mind,
        entries: entries.length ? [...keptEntries, ...entries] : state.entries,
      };
    }

    case 'ADD_HABIT':
      return {
        ...state,
        habits: [...state.habits, action.habit],
        rules: [...state.rules, action.rule],
        policies: [...state.policies.filter((p) => p.habitId !== action.policy.habitId), action.policy],
      };

    case 'UPDATE_HABIT': {
      const habits = state.habits.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h));
      // Archiving withdraws the habit's pending one-off reminders (a Sugar Shield follow-up must not ring
      // for a habit that was just put away); restoring it does not bring them back.
      const events = action.patch.archived === true ? state.events.filter((e) => e.habitId !== action.id) : state.events;
      return { ...state, habits, events };
    }

    case 'DELETE_HABIT':
      return {
        ...state,
        habits: state.habits.filter((h) => h.id !== action.id),
        rules: state.rules.filter((r) => r.habitId !== action.id),
        policies: state.policies.filter((p) => p.habitId !== action.id),
        entries: state.entries.filter((e) => e.habitId !== action.id),
        events: state.events.filter((e) => e.habitId !== action.id),
      };

    case 'REMOVE_RULE': {
      const rules = state.rules.filter((x) => !(x.habitId === action.habitId && x.effectiveFrom === action.effectiveFrom));
      if (rules.length === state.rules.length || !rules.some((x) => x.habitId === action.habitId)) return state;
      return { ...state, rules };
    }

    case 'SET_RULE': {
      const r = action.rule;
      const others = state.rules.filter((x) => !(x.habitId === r.habitId && x.effectiveFrom === r.effectiveFrom));
      return { ...state, rules: [...others, r] };
    }

    case 'SET_POLICY':
      return { ...state, policies: [...state.policies.filter((p) => p.habitId !== action.policy.habitId), action.policy] };

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'SNOOZE':
      return { ...state, nudgeSnoozedUntil: action.untilMs };

    case 'SWAP': {
      const prev = state.nudgeSwap?.day === action.day ? state.nudgeSwap.offset : 0;
      return { ...state, nudgeSwap: { day: action.day, offset: prev + 1 } };
    }

    case 'NUDGE_EVENT': {
      const kept = state.nudgeEvents.filter((e) => e.day >= action.keepFromDay);
      return { ...state, nudgeEvents: [...kept, action.event] };
    }

    case 'SCHEDULE_EVENT':
      return { ...state, events: [...state.events.filter((e) => e.id !== action.event.id), action.event] };

    case 'REMOVE_EVENT':
      return state.events.some((e) => e.id === action.id) ? { ...state, events: state.events.filter((e) => e.id !== action.id) } : state;

    case 'PRUNE_EVENTS': {
      const keep = state.events.filter((e) => e.at >= action.beforeMs);
      return keep.length === state.events.length ? state : { ...state, events: keep };
    }

    case 'PERIOD_START': {
      const result = applyPeriodStart(state.settings.cycle.history, action.day, state.settings.cycle, action.today);
      if (!result.ok) return state;
      return withHistory(state, result.history);
    }

    case 'PERIOD_END': {
      const history = applyPeriodEnd(state.settings.cycle.history, action.day);
      return history ? withHistory(state, history) : state;
    }

    case 'UPDATE_PERIOD': {
      const history = normalizeHistory(state.settings.cycle.history);
      const span = history.find((p) => p.start === action.start);
      if (!span) return state;
      const next: PeriodSpan = { ...span };
      if (action.patch.start !== undefined) {
        if (history.some((p) => p.start === action.patch.start && p.start !== action.start)) return state;
        next.start = action.patch.start;
      }
      if (action.patch.end === null) delete next.end;
      else if (action.patch.end !== undefined) next.end = action.patch.end;
      if (action.patch.excluded !== undefined) {
        if (action.patch.excluded) next.excluded = true;
        else delete next.excluded;
      }
      const merged = history.map((p) => (p.start === action.start ? next : p));
      return withHistory(state, closeOlderOpenSpans(merged, state.settings.cycle));
    }

    case 'DELETE_PERIOD': {
      const history = state.settings.cycle.history.filter((p) => p.start !== action.start);
      return history.length === state.settings.cycle.history.length ? state : withHistory(state, normalizeHistory(history));
    }

    case 'SET_CYCLE_LOG': {
      const rest = state.cycleLogs.filter((l) => l.day !== action.log.day);
      if (isEmptyLog(action.log)) return rest.length === state.cycleLogs.length ? state : { ...state, cycleLogs: rest };
      const log: CycleDayLog = { day: action.log.day, symptoms: { ...action.log.symptoms } };
      if (action.log.flow !== undefined) log.flow = action.log.flow;
      if (action.log.mood !== undefined) log.mood = action.log.mood;
      if (action.log.note && action.log.note.trim()) log.note = action.log.note.trim();
      return { ...state, cycleLogs: [...rest, log].sort((a, b) => (a.day < b.day ? -1 : 1)) };
    }

    case 'CLEAR_CYCLE':
      return state.cycleLogs.length === 0 && state.settings.cycle.history.length === 0 ? state : { ...withHistory(state, []), cycleLogs: [] };

    case 'IMPORT_BODY': {
      const body = mergeBody(state.body, action.batch);
      return body === state.body ? state : { ...state, body };
    }

    case 'SET_AUTO_ENTRY': {
      // Health Connect owns the day's automatic total: every non-manual row for that day goes, so a
      // widget or notification write can never be summed with the phone's own count.
      const rest = state.entries.filter((x) => !(x.habitId === action.habitId && x.day === action.day && x.source !== 'MANUAL'));
      const entries = action.entry ? [...rest, action.entry] : rest;
      return entries.length === state.entries.length && !action.entry ? state : { ...state, entries };
    }

    case 'SET_WORKOUT_HIDDEN':
      return {
        ...state,
        body: { ...state.body, workouts: state.body.workouts.map((w) => (w.id === action.id && w.hidden !== action.hidden ? { ...w, hidden: action.hidden } : w)) },
      };

    case 'BODY_SYNC': {
      const merged = { ...state.body.sync, ...action.patch };
      for (const k of Object.keys(merged) as (keyof BodySync)[]) if (merged[k] === undefined) delete merged[k];
      // A patch that changes nothing (the same error from every 3-hourly background read) is a
      // no-op, so it neither bumps the generation nor rewrites the database.
      const before = state.body.sync as unknown as Record<string, unknown>;
      const after = merged as unknown as Record<string, unknown>;
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      let same = true;
      for (const k of keys) {
        const a = before[k];
        const b = after[k];
        if (Array.isArray(a) && Array.isArray(b)) {
          if (a.length !== b.length || a.some((x, i) => x !== b[i])) same = false;
        } else if (a !== b) same = false;
        if (!same) break;
      }
      if (same) return state;
      return { ...state, body: { ...state.body, sync: merged } };
    }

    case 'CLEAR_BODY':
      return {
        ...state,
        body: { ...EMPTY_BODY, sync: { granted: [], background: false } },
        entries: state.entries.filter((e) => e.source !== 'AUTO_HC'),
        water: state.water.filter((w) => w.source !== 'AUTO_HC'),
      };

    default:
      return state;
  }
}

function withHistory(state: TrackerState, history: PeriodSpan[]): TrackerState {
  return { ...state, settings: { ...state.settings, cycle: { ...state.settings.cycle, history } } };
}
