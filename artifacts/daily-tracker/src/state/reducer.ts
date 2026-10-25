import type { Habit, HabitEntry, HabitRule, MindSession, MovementSnack, NudgePolicy, Settings, WaterEntry } from '@/src/domain/models';
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
  | { type: 'ADD_HABIT'; habit: Habit; rule: HabitRule; policy: NudgePolicy }
  | { type: 'UPDATE_HABIT'; id: string; patch: Partial<Omit<Habit, 'id' | 'type'>> }
  | { type: 'SET_RULE'; rule: HabitRule }
  | { type: 'SET_POLICY'; policy: NudgePolicy }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'SNOOZE'; untilMs: number }
  | { type: 'SWAP'; day: string }
  | { type: 'PERIOD_START'; day: string }
  | { type: 'PERIOD_END'; day: string };

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

    case 'ADD_ENTRY':
      return { ...state, entries: [...state.entries, action.entry] };

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

    case 'ADD_HABIT':
      return {
        ...state,
        habits: [...state.habits, action.habit],
        rules: [...state.rules, action.rule],
        policies: [...state.policies.filter((p) => p.habitId !== action.policy.habitId), action.policy],
      };

    case 'UPDATE_HABIT':
      return { ...state, habits: state.habits.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)) };

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

    default:
      return state;
  }
}
