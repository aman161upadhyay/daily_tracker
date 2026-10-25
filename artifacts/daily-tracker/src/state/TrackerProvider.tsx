import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createStore } from '@/src/data/createStore';
import { consumeHeadlessWrite } from '@/src/services/replan';
import type { TrackerStore } from '@/src/data/store';
import type { Cadence, Category, Habit, HabitIcon, HabitRule, HabitType, MindKind, NudgePolicy, Settings, SnackTrigger, SnackType } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import { currentZone, newId, now } from '@/src/domain/time/clock';
import { addDays, calendarDayOf, instantOf, minutesOfDay, trackingDayOf, weekStartOf } from '@/src/domain/time/trackingDay';
import { PRESET_BY_ID } from '@/src/library/presets';
import { reducer, type Action } from './reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from './seed';
import { latestRule } from './selectors';
import type { TrackerState } from './types';

export interface TrackerContextValue {
  state: TrackerState;
  ready: boolean;
  /** Set when loading or saving failed; the UI shows it instead of guessing. */
  storageError: string | null;
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

export interface HabitDraft {
  name: string;
  category: Category;
  type: HabitType;
  unit: string;
  icon: HabitIcon;
  cadence: Cadence;
  timesPerPeriod: number;
  target: number;
  freezesPerMonth: number;
  pinned: boolean;
}

export interface OnboardingChoices {
  name: string;
  units: Settings['units'];
  waterGoalMl: number;
  activeStartMin: number;
  activeEndMin: number;
  presetIds: string[];
  cycleEnabled: boolean;
}

export interface TrackerActions {
  /** Toggle a yes/no habit for a day (today by default). */
  toggleYesNo(habit: Habit, day?: string): void;
  increment(habit: Habit, by?: number): void;
  decrement(habit: Habit): void;
  /** Log an amount (ml, minutes, reps, count…) for a day (today by default). */
  logAmount(habit: Habit, value: number, day?: string): void;
  /** Backfill: make a day's total equal `value`. */
  setDayValue(habit: Habit, value: number, day: string): void;
  addWater(ml: number, source?: 'MANUAL' | 'AUTO_WIDGET'): void;
  undoWater(): void;
  removeLog(log: 'entry' | 'water' | 'snack' | 'mind', id: string): void;
  logSnack(type: SnackType, opts?: { habitId?: string; trigger?: SnackTrigger; reps?: number; seconds?: number }): void;
  logMind(kind: MindKind, minutes: number): void;
  addPreset(presetId: string): Habit | null;
  createHabit(draft: HabitDraft): Habit;
  /** Edit name/icon/pin and the rule. Rule changes are versioned, never retroactive. */
  saveHabit(habit: Habit, draft: HabitDraft): void;
  updateHabit(id: string, patch: Partial<Omit<Habit, 'id' | 'type'>>): void;
  deleteHabit(id: string): void;
  setTarget(habit: Habit, target: number): void;
  setPolicy(policy: NudgePolicy): void;
  updateSettings(patch: Partial<Settings>): void;
  completeOnboarding(choices: OnboardingChoices): void;
  snoozeNudge(minutes: number): void;
  swapNudge(): void;
  /** One-off nudge created in-app (Sugar Shield follow-up). */
  scheduleEvent(event: { id: string; habitId: string; inMinutes: number; title: string; body: string }): void;
  removeEvent(id: string): void;
  startFresh(): void;
  loadSample(): void;
  /** Replace everything with an imported state (already validated). */
  importState(state: TrackerState): void;
  periodStart(day?: string): void;
  periodEnd(day?: string): void;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

const PLACEHOLDER: TrackerState = buildEmptyState('1970-01-01');

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const inner = cause instanceof Error ? ` (${cause.message})` : '';
    return `${err.message}${inner}`;
  }
  return String(err);
}

/** First day of the period after the one containing `day`, for cadence changes. */
function nextPeriodStart(cadence: Cadence, day: string): string {
  if (cadence === 'DAILY') return addDays(day, 1);
  if (cadence === 'WEEKLY') return addDays(weekStartOf(day), 7);
  const [y, m] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m!, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, PLACEHOLDER);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => now());
  const zone = useMemo(() => currentZone(), []);

  const storeRef = useRef<TrackerStore | null>(null);
  /** The last state handed to the store; `persist` diffs against it. */
  const persistedRef = useRef<TrackerState | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // Open the store and hydrate. A fresh install starts empty (onboarding takes over).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await createStore();
        let next = await store.load();
        if (cancelled) return;
        if (!next) {
          next = buildEmptyState(trackingDayOf(now(), zone));
          await store.replace(next);
        }
        storeRef.current = store;
        persistedRef.current = next;
        dispatch({ type: 'HYDRATE', state: next });
      } catch (err) {
        console.error('Storage failed to open', err);
        if (!cancelled) setStorageError(describe(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zone]);

  // Persist every change after hydration, in order, writing only what changed.
  useEffect(() => {
    const store = storeRef.current;
    const prev = persistedRef.current;
    if (!store || !prev || prev === state) return;
    persistedRef.current = state;
    queueRef.current = queueRef.current
      .then(() => store.persist(prev, state))
      .catch((err) => {
        console.error('Failed to save', err);
        setStorageError(`Could not save your last change: ${describe(err)}`);
      });
  }, [state]);

  // Clock: refresh every 30 s and whenever the app returns to the foreground.
  // On foreground, also pick up rows a headless writer (notification button) added while we slept.
  useEffect(() => {
    const tick = () => setNowMs(now());
    const interval = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      tick();
      void (async () => {
        const store = storeRef.current;
        if (!store || !(await consumeHeadlessWrite())) return;
        await queueRef.current;
        const fresh = await store.load();
        if (!fresh) return;
        persistedRef.current = fresh;
        dispatch({ type: 'HYDRATE', state: fresh });
      })().catch((err) => console.warn('Reload after background change failed', err));
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

  /** Timestamp + tracking day for a log. Past days are stamped at noon local time. */
  const stamp = useCallback(
    (day?: string) => {
      const t = now();
      const todayNow = trackingDayOf(t, zone, boundary);
      if (!day || day === todayNow) return { at: t, zone, day: todayNow };
      return { at: instantOf(day, 12 * 60, zone), zone, day };
    },
    [zone, boundary],
  );

  const latest = useRef(state);
  latest.current = state;

  const actions = useMemo<TrackerActions>(() => {
    const stateRef = () => latest.current;

    const logFor = (habit: Habit, value: number, day?: string) => {
      const { at, zone: z, day: d } = stamp(day);
      if (habit.presetId === 'water') {
        dispatch({ type: 'ADD_WATER', entry: { id: newId(), at, zone: z, day: d, ml: Math.round(value), source: 'MANUAL' } });
        return;
      }
      if (habit.snackType) {
        const meta = SNACK_LABELS[habit.snackType];
        const trigger: SnackTrigger = habit.presetId === 'sugar-shield' ? 'SUGAR_SHIELD' : 'MANUAL';
        for (let i = 0; i < Math.max(1, Math.round(value)); i++) {
          dispatch({ type: 'LOG_SNACK', snack: { id: newId(), at: at + i, zone: z, day: d, type: habit.snackType, reps: meta.defaultReps, seconds: meta.defaultSeconds, trigger } });
        }
        return;
      }
      if (habit.mindKind) {
        const minutes = Math.max(1, Math.round(value));
        dispatch({ type: 'LOG_MIND', session: { id: newId(), startAt: at - minutes * 60_000, endAt: at, zone: z, day: d, kind: habit.mindKind, minutes } });
        return;
      }
      dispatch({ type: 'ADD_ENTRY', entry: { id: newId(), habitId: habit.id, day: d, at, zone: z, value, source: 'MANUAL' } });
    };

    const currentRule = (habit: Habit, day: string): HabitRule =>
      latestRule(stateRef(), habit.id) ?? { habitId: habit.id, effectiveFrom: day, cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 2 };

    return {
      toggleYesNo(habit, day) {
        const { at, zone: z, day: d } = stamp(day);
        dispatch({ type: 'TOGGLE_ENTRY', entry: { id: newId(), habitId: habit.id, day: d, at, zone: z, value: 1, source: 'MANUAL' } });
      },
      increment(habit, by = 1) {
        if (habit.presetId === 'water') return logFor(habit, by === 1 ? stateRef().settings.tapSizeMl : by);
        if (habit.mindKind) return logFor(habit, by === 1 ? (habit.mindKind === 'MEDITATION' ? 13 : 5) : by);
        logFor(habit, by);
      },
      decrement(habit) {
        const { day } = stamp();
        if (habit.presetId === 'water') return dispatch({ type: 'UNDO_WATER', day });
        if (habit.snackType) return dispatch({ type: 'UNDO_SNACK', day, habit });
        if (habit.mindKind) {
          const last = stateRef()
            .mind.filter((m) => m.day === day && m.kind === habit.mindKind)
            .sort((a, b) => b.endAt - a.endAt)[0];
          if (last) dispatch({ type: 'REMOVE_LOG', log: 'mind', id: last.id });
          return;
        }
        dispatch({ type: 'REMOVE_LAST_ENTRY', habitId: habit.id, day });
      },
      logAmount(habit, value, day) {
        if (value <= 0) return;
        logFor(habit, value, day);
      },
      setDayValue(habit, value, day) {
        dispatch({ type: 'CLEAR_DAY', habit, day });
        if (value > 0) logFor(habit, value, day);
      },
      addWater(ml, source = 'MANUAL') {
        const { at, zone: z, day } = stamp();
        dispatch({ type: 'ADD_WATER', entry: { id: newId(), at, zone: z, day, ml, source } });
      },
      undoWater() {
        dispatch({ type: 'UNDO_WATER', day: stamp().day });
      },
      removeLog(log, id) {
        dispatch({ type: 'REMOVE_LOG', log, id });
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
      createHabit(draft) {
        const { day } = stamp();
        const habit: Habit = {
          id: newId(),
          name: draft.name.trim() || 'New habit',
          category: draft.category,
          type: draft.type,
          unit: draft.type === 'YES_NO' ? '' : draft.unit.trim(),
          icon: draft.icon,
          createdDay: day,
          archived: false,
          pinned: draft.pinned,
        };
        const rule: HabitRule = {
          habitId: habit.id,
          effectiveFrom: day,
          cadence: draft.cadence,
          timesPerPeriod: draft.cadence === 'DAILY' ? 1 : Math.max(1, Math.round(draft.timesPerPeriod)),
          target: draft.type === 'YES_NO' ? 1 : Math.max(1, Math.round(draft.target)),
          freezesPerMonth: Math.max(0, Math.round(draft.freezesPerMonth)),
        };
        const policy: NudgePolicy = { habitId: habit.id, kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false };
        dispatch({ type: 'ADD_HABIT', habit, rule, policy });
        return habit;
      },
      saveHabit(habit, draft) {
        const { day } = stamp();
        const patch: Partial<Omit<Habit, 'id' | 'type'>> = {};
        const name = draft.name.trim();
        if (name && name !== habit.name) patch.name = name;
        if (draft.icon !== habit.icon) patch.icon = draft.icon;
        if (draft.category !== habit.category) patch.category = draft.category;
        if (habit.type !== 'YES_NO' && draft.unit.trim() && draft.unit.trim() !== habit.unit) patch.unit = draft.unit.trim();
        if (draft.pinned !== habit.pinned) patch.pinned = draft.pinned;
        if (Object.keys(patch).length > 0) dispatch({ type: 'UPDATE_HABIT', id: habit.id, patch });

        const current = currentRule(habit, day);
        const next: HabitRule = {
          habitId: habit.id,
          effectiveFrom: day,
          cadence: draft.cadence,
          timesPerPeriod: draft.cadence === 'DAILY' ? 1 : Math.max(1, Math.round(draft.timesPerPeriod)),
          target: habit.type === 'YES_NO' ? 1 : Math.max(1, Math.round(draft.target)),
          freezesPerMonth: Math.max(0, Math.round(draft.freezesPerMonth)),
        };
        const changed =
          next.cadence !== current.cadence || next.timesPerPeriod !== current.timesPerPeriod || next.target !== current.target || next.freezesPerMonth !== current.freezesPerMonth;
        if (changed) {
          // Same cadence: applies from today (the current period). New cadence: from the next period.
          const effectiveFrom = next.cadence === current.cadence ? day : nextPeriodStart(current.cadence, day);
          dispatch({ type: 'SET_RULE', rule: { ...next, effectiveFrom: effectiveFrom < current.effectiveFrom ? current.effectiveFrom : effectiveFrom } });
        }
        if (habit.presetId === 'water' && next.target !== current.target) {
          dispatch({ type: 'UPDATE_SETTINGS', patch: { waterGoalMl: Math.max(250, next.target) } });
        }
      },
      updateHabit(id, patch) {
        dispatch({ type: 'UPDATE_HABIT', id, patch });
      },
      deleteHabit(id) {
        dispatch({ type: 'DELETE_HABIT', id });
      },
      setTarget(habit, target) {
        const { day } = stamp();
        const base = currentRule(habit, day);
        dispatch({ type: 'SET_RULE', rule: { ...base, effectiveFrom: day, target: Math.max(1, Math.round(target)) } });
        if (habit.presetId === 'water') dispatch({ type: 'UPDATE_SETTINGS', patch: { waterGoalMl: Math.max(250, Math.round(target)) } });
      },
      setPolicy(policy) {
        dispatch({ type: 'SET_POLICY', policy });
      },
      updateSettings(patch) {
        dispatch({ type: 'UPDATE_SETTINGS', patch });
      },
      completeOnboarding(choices) {
        const { day } = stamp();
        const s = stateRef();
        dispatch({
          type: 'UPDATE_SETTINGS',
          patch: {
            name: choices.name.trim(),
            units: choices.units,
            waterGoalMl: choices.waterGoalMl,
            activeStartMin: choices.activeStartMin,
            activeEndMin: choices.activeEndMin,
            cycleEnabled: choices.cycleEnabled,
            onboardingDone: true,
          },
        });
        const wanted = new Set(choices.presetIds);
        for (const h of s.habits) {
          if (h.presetId && !wanted.has(h.presetId) && !h.archived) dispatch({ type: 'UPDATE_HABIT', id: h.id, patch: { archived: true } });
        }
        for (const presetId of choices.presetIds) {
          const preset = PRESET_BY_ID[presetId];
          if (!preset) continue;
          const existing = s.habits.find((h) => h.presetId === presetId);
          if (existing) {
            if (existing.archived) dispatch({ type: 'UPDATE_HABIT', id: existing.id, patch: { archived: false } });
            continue;
          }
          const built = habitFromPreset(preset, presetId === 'water' ? 'h_water' : newId(), day);
          dispatch({ type: 'ADD_HABIT', ...built });
        }
        if (wanted.has('water')) {
          const water = s.habits.find((h) => h.presetId === 'water');
          const rule = water ? latestRule(s, water.id) : undefined;
          if (water && rule && rule.target !== choices.waterGoalMl) {
            dispatch({ type: 'SET_RULE', rule: { ...rule, effectiveFrom: day, target: choices.waterGoalMl } });
          }
        }
      },
      snoozeNudge(minutes) {
        dispatch({ type: 'SNOOZE', untilMs: now() + minutes * 60_000 });
      },
      swapNudge() {
        dispatch({ type: 'SWAP', day: stamp().day });
      },
      scheduleEvent(event) {
        const { at, zone: z, day } = stamp();
        dispatch({ type: 'SCHEDULE_EVENT', event: { id: event.id, habitId: event.habitId, at: at + event.inMinutes * 60_000, zone: z, day, title: event.title, body: event.body } });
      },
      removeEvent(id) {
        dispatch({ type: 'REMOVE_EVENT', id });
      },
      startFresh() {
        dispatch({ type: 'REPLACE', state: buildEmptyState(stamp().day, { ...stateRef().settings, onboardingDone: true }) });
      },
      loadSample() {
        const t = now();
        dispatch({ type: 'REPLACE', state: buildSampleState(trackingDayOf(t, zone, boundary), zone, t) });
      },
      importState(next) {
        dispatch({ type: 'REPLACE', state: { ...next, settings: { ...next.settings, onboardingDone: true } } });
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
    () => ({ state, ready, storageError, nowMs, zone, today, calendarToday, nowMin, dispatch, actions }),
    [state, ready, storageError, nowMs, zone, today, calendarToday, nowMin, actions],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside TrackerProvider');
  return ctx;
}
