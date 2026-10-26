import { mergeBody } from '@/src/domain/body/merge';
import { EMPTY_BODY, type BodyBatch, type BodySync } from '@/src/domain/body/types';
import type { Habit, HabitEntry, HabitRule, MindSession, MovementSnack, NudgeEvent, NudgePolicy, ScheduledEvent, Settings, WaterEntry } from '@/src/domain/models';
import type { TrackerState } from './types';

export type Action =
  | { type: 'HYDRATE'; state: TrackerState }
  | { type: 'REPLACE'; state: TrackerState }
  | { type: 'ADD_ENTRY'; entry: HabitEntry }
  | { type: 'TOGGLE_ENTRY'; entry: HabitEntry }
  | { type: 'REMOVE_LAST_ENTRY'; habitId: string; day: string }
  | { type: 'ADD_WATER'; entry: WaterEntry }
  | { type: 'UNDO_WATER'; day: string }
  | { type: 'LOG_SNACK'; snack: MovementSnack }
  | { type: 'UNDO_SNACK'; day: string; habit: Habit }
  | { type: 'LOG_MIND'; session: MindSession }
  /** Delete one logged item by id (water entries list, undo a backfill). */
  | { type: 'REMOVE_LOG'; log: 'entry' | 'water' | 'snack' | 'mind'; id: string }
  /** Clear a habit's logs on one day before writing a backfilled total. */
  | { type: 'CLEAR_DAY'; habit: Habit; day: string }
  | { type: 'ADD_HABIT'; habit: Habit; rule: HabitRule; policy: NudgePolicy }
  /** Permanent delete: the habit, its rules, policy and logs. */
  | { type: 'DELETE_HABIT'; id: string }
  | { type: 'UPDATE_HABIT'; id: string; patch: Partial<Omit<Habit, 'id' | 'type'>> }
  | { type: 'SET_RULE'; rule: HabitRule }
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
  | { type: 'PERIOD_START'; day: string }
  | { type: 'PERIOD_END'; day: string }
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

    case 'UNDO_SNACK': {
      const h = action.habit;
      const sugar = h.presetId === 'sugar-shield';
      return {
        ...state,
        snacks: removeLast(
          state.snacks,
          (s) => s.day === action.day && (sugar ? s.trigger === 'SUGAR_SHIELD' : s.type === h.snackType && s.trigger !== 'SUGAR_SHIELD'),
          (s) => s.at,
        ),
      };
    }

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
      const h = action.habit;
      const day = action.day;
      if (h.presetId === 'water') return { ...state, water: state.water.filter((w) => w.day !== day) };
      if (h.snackType) {
        const sugar = h.presetId === 'sugar-shield';
        return {
          ...state,
          snacks: state.snacks.filter((s) => !(s.day === day && (sugar ? s.trigger === 'SUGAR_SHIELD' : s.type === h.snackType && s.trigger !== 'SUGAR_SHIELD'))),
        };
      }
      if (h.mindKind) return { ...state, mind: state.mind.filter((m) => !(m.day === day && m.kind === h.mindKind)) };
      return { ...state, entries: state.entries.filter((e) => !(e.day === day && e.habitId === h.id)) };
    }

    case 'ADD_HABIT':
      return {
        ...state,
        habits: [...state.habits, action.habit],
        rules: [...state.rules, action.rule],
        policies: [...state.policies.filter((p) => p.habitId !== action.policy.habitId), action.policy],
      };

    case 'UPDATE_HABIT':
      return { ...state, habits: state.habits.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)) };

    case 'DELETE_HABIT':
      return {
        ...state,
        habits: state.habits.filter((h) => h.id !== action.id),
        rules: state.rules.filter((r) => r.habitId !== action.id),
        policies: state.policies.filter((p) => p.habitId !== action.id),
        entries: state.entries.filter((e) => e.habitId !== action.id),
      };

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
      const history = state.settings.cycle.history.filter((p) => p.start !== action.day);
      return {
        ...state,
        settings: { ...state.settings, cycle: { ...state.settings.cycle, history: [...history, { start: action.day }] } },
      };
    }

    case 'PERIOD_END': {
      const history = [...state.settings.cycle.history].sort((a, b) => (a.start < b.start ? -1 : 1));
      const last = history[history.length - 1];
      if (!last || last.end) return state;
      history[history.length - 1] = { ...last, end: action.day };
      return { ...state, settings: { ...state.settings, cycle: { ...state.settings.cycle, history } } };
    }

    case 'IMPORT_BODY': {
      const body = mergeBody(state.body, action.batch);
      return body === state.body ? state : { ...state, body };
    }

    case 'SET_AUTO_ENTRY': {
      const rest = state.entries.filter((x) => !(x.habitId === action.habitId && x.day === action.day && x.source === 'AUTO_HC'));
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
