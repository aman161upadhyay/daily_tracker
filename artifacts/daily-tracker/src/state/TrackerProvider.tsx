import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Habit, HabitRule, MindKind, NudgePolicy, Settings, SnackTrigger, SnackType } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import { currentZone, newId, now } from '@/src/domain/time/clock';
import { calendarDayOf, minutesOfDay, trackingDayOf } from '@/src/domain/time/trackingDay';
import { PRESET_BY_ID } from '@/src/library/presets';
import { reducer, type Action } from './reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from './seed';
import { STORAGE_KEY, type TrackerState } from './types';

export interface TrackerContextValue {
  state: TrackerState;
  ready: boolean;
  nowMs: number;
  zone: string;
  /** Tracking day (3 am boundary by default). */
  today: string;
  /** Calendar day (midnight boundary) for cycle data. */
  calendarToday: string;
  nowMin: number;
  dispatch: React.Dispatch<Action>;
  actions: TrackerActions;
}

export interface TrackerActions {
  toggleYesNo(habit: Habit): void;
  increment(habit: Habit, by?: number): void;
  decrement(habit: Habit): void;
  addWater(ml: number, source?: 'MANUAL' | 'AUTO_WIDGET'): void;
  undoWater(): void;
  logSnack(type: SnackType, opts?: { habitId?: string; trigger?: SnackTrigger; reps?: number; seconds?: number }): void;
  logMind(kind: MindKind, minutes: number): void;
  addPreset(presetId: string): Habit | null;
  addCustomHabit(input: Pick<Habit, 'name' | 'category' | 'type' | 'unit' | 'icon'> & { target: number }): Habit;
  updateHabit(id: string, patch: Partial<Omit<Habit, 'id' | 'type'>>): void;
  setTarget(habit: Habit, target: number): void;
  setPolicy(policy: NudgePolicy): void;
  updateSettings(patch: Partial<Settings>): void;
  snoozeNudge(minutes: number): void;
  swapNudge(): void;
  startFresh(): void;
  loadSample(): void;
  periodStart(day?: string): void;
  periodEnd(day?: string): void;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

function migrate(raw: unknown): TrackerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<TrackerState>;
  if (s.version !== 1 || !Array.isArray(s.habits)) return null;
  return s as TrackerState;
}

const PLACEHOLDER: TrackerState = buildEmptyState('1970-01-01');

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, PLACEHOLDER);
  const [ready, setReady] = useState(false);
  const [nowMs, setNowMs] = useState(() => now());
  const zone = useMemo(() => currentZone(), []);
  const hydrated = useRef(false);

  // Hydrate from storage, seeding sample data on first launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: TrackerState | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) next = migrate(JSON.parse(raw));
      } catch (err) {
        console.warn('Failed to read saved state; starting with sample data', err);
      }
      if (cancelled) return;
      const t = now();
      if (!next) next = buildSampleState(trackingDayOf(t, zone), zone, t);
      dispatch({ type: 'HYDRATE', state: next });
      hydrated.current = true;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [zone]);

  // Persist (debounced) after every change post-hydration.
  useEffect(() => {
    if (!hydrated.current) return;
    const handle = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((err) => console.warn('Failed to save state', err));
    }, 250);
    return () => clearTimeout(handle);
  }, [state]);

  // Clock: refresh every 30 s and whenever the app returns to the foreground.
  useEffect(() => {
    const tick = () => setNowMs(now());
    const interval = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  const boundary = state.settings.dayBoundaryHour;
  const today = useMemo(() => trackingDayOf(nowMs, zone, boundary), [nowMs, zone, boundary]);
  const calendarToday = useMemo(() => calendarDayOf(nowMs, zone), [nowMs, zone]);
  const nowMin = useMemo(() => minutesOfDay(nowMs, zone), [nowMs, zone]);

  const stamp = useCallback(() => {
    const t = now();
    return { at: t, zone, day: trackingDayOf(t, zone, boundary) };
  }, [zone, boundary]);

  const latest = useRef(state);
  latest.current = state;

  const actions = useMemo<TrackerActions>(() => {
    const stateRef = () => latest.current;
    return {
      toggleYesNo(habit) {
        const { at, zone: z, day } = stamp();
        dispatch({ type: 'TOGGLE_ENTRY', entry: { id: newId(), habitId: habit.id, day, at, zone: z, value: 1, source: 'MANUAL' } });
      },
      increment(habit, by = 1) {
        const { at, zone: z, day } = stamp();
        if (habit.presetId === 'water') {
          dispatch({ type: 'ADD_WATER', entry: { id: newId(), at, zone: z, day, ml: by === 1 ? 250 : by, source: 'MANUAL' } });
          return;
        }
        if (habit.snackType) {
          const meta = SNACK_LABELS[habit.snackType];
          dispatch({
            type: 'LOG_SNACK',
            snack: {
              id: newId(),
              at,
              zone: z,
              day,
              type: habit.snackType,
              reps: meta.defaultReps,
              seconds: meta.defaultSeconds,
              trigger: habit.presetId === 'sugar-shield' ? 'SUGAR_SHIELD' : 'MANUAL',
            },
          });
          return;
        }
        if (habit.mindKind) {
          const minutes = by === 1 ? (habit.mindKind === 'MEDITATION' ? 13 : 5) : by;
          dispatch({
            type: 'LOG_MIND',
            session: { id: newId(), startAt: at - minutes * 60_000, endAt: at, zone: z, day, kind: habit.mindKind, minutes },
          });
          return;
        }
        dispatch({ type: 'ADD_ENTRY', entry: { id: newId(), habitId: habit.id, day, at, zone: z, value: by, source: 'MANUAL' } });
      },
      decrement(habit) {
        const { day } = stamp();
        if (habit.presetId === 'water') return dispatch({ type: 'UNDO_WATER', day });
        if (habit.snackType) return dispatch({ type: 'UNDO_SNACK', day, habit });
        dispatch({ type: 'REMOVE_LAST_ENTRY', habitId: habit.id, day });
      },
      addWater(ml, source = 'MANUAL') {
        const { at, zone: z, day } = stamp();
        dispatch({ type: 'ADD_WATER', entry: { id: newId(), at, zone: z, day, ml, source } });
      },
      undoWater() {
        dispatch({ type: 'UNDO_WATER', day: stamp().day });
      },
      logSnack(type, opts = {}) {
        const { at, zone: z, day } = stamp();
        const meta = SNACK_LABELS[type];
        dispatch({
          type: 'LOG_SNACK',
          snack: {
            id: newId(),
            at,
            zone: z,
            day,
            type,
            reps: opts.reps ?? meta.defaultReps,
            seconds: opts.seconds ?? meta.defaultSeconds,
            trigger: opts.trigger ?? 'MANUAL',
          },
        });
      },
      logMind(kind, minutes) {
        const { at, zone: z, day } = stamp();
        dispatch({ type: 'LOG_MIND', session: { id: newId(), startAt: at - minutes * 60_000, endAt: at, zone: z, day, kind, minutes } });
      },
      addPreset(presetId) {
        const preset = PRESET_BY_ID[presetId];
        if (!preset) return null;
        const s = stateRef();
        const existing = s.habits.find((h) => h.presetId === presetId);
        if (existing) {
          if (existing.archived) dispatch({ type: 'UPDATE_HABIT', id: existing.id, patch: { archived: false } });
          return existing;
        }
        const { day } = stamp();
        const built = habitFromPreset(preset, newId(), day);
        dispatch({ type: 'ADD_HABIT', ...built });
        return built.habit;
      },
      addCustomHabit(input) {
        const { day } = stamp();
        const habit: Habit = {
          id: newId(),
          name: input.name,
          category: input.category,
          type: input.type,
          unit: input.unit,
          icon: input.icon,
          createdDay: day,
          archived: false,
          pinned: false,
        };
        const rule: HabitRule = { habitId: habit.id, effectiveFrom: day, cadence: 'DAILY', timesPerPeriod: 1, target: Math.max(1, input.target), freezesPerMonth: 2 };
        const policy: NudgePolicy = { habitId: habit.id, kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false };
        dispatch({ type: 'ADD_HABIT', habit, rule, policy });
        return habit;
      },
      updateHabit(id, patch) {
        dispatch({ type: 'UPDATE_HABIT', id, patch });
      },
      setTarget(habit, target) {
        const { day } = stamp();
        const s = stateRef();
        const current = [...s.rules.filter((r) => r.habitId === habit.id)].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)).pop();
        const base: HabitRule = current ?? { habitId: habit.id, effectiveFrom: day, cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 2 };
        dispatch({ type: 'SET_RULE', rule: { ...base, effectiveFrom: day, target: Math.max(1, Math.round(target)) } });
        if (habit.presetId === 'water') dispatch({ type: 'UPDATE_SETTINGS', patch: { waterGoalMl: Math.max(250, Math.round(target)) } });
      },
      setPolicy(policy) {
        dispatch({ type: 'SET_POLICY', policy });
      },
      updateSettings(patch) {
        dispatch({ type: 'UPDATE_SETTINGS', patch });
      },
      snoozeNudge(minutes) {
        dispatch({ type: 'SNOOZE', untilMs: now() + minutes * 60_000 });
      },
      swapNudge() {
        dispatch({ type: 'SWAP', day: stamp().day });
      },
      startFresh() {
        dispatch({ type: 'REPLACE', state: buildEmptyState(stamp().day, stateRef().settings) });
      },
      loadSample() {
        const t = now();
        dispatch({ type: 'REPLACE', state: buildSampleState(trackingDayOf(t, zone, boundary), zone, t) });
      },
      periodStart(day) {
        dispatch({ type: 'PERIOD_START', day: day ?? calendarDayOf(now(), zone) });
      },
      periodEnd(day) {
        dispatch({ type: 'PERIOD_END', day: day ?? calendarDayOf(now(), zone) });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, zone, boundary]);

  const value = useMemo<TrackerContextValue>(
    () => ({ state, ready, nowMs, zone, today, calendarToday, nowMin, dispatch, actions }),
    [state, ready, nowMs, zone, today, calendarToday, nowMin, actions],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside TrackerProvider');
  return ctx;
}
