import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createStore } from '@/src/data/createStore';
import { headlessRevision, onHeadlessWrite } from '@/src/services/replan';
import type { TrackerStore } from '@/src/data/store';
import type { Cadence, Category, CycleDayLog, CycleReminder, Habit, HabitIcon, HabitRule, HabitType, MindKind, NudgePolicy, Settings, SnackTrigger, SnackType } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import { applyPeriodStart } from '@/src/domain/cycle/timeline';
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
  /** Android Auto Backup opt-in (shown in onboarding on Android; defaults to on). */
  cloudBackup?: boolean;
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
  /** Log a period start (today by default); returns the reason when the day is refused. */
  periodStart(day?: string): string | null;
  periodEnd(day?: string): void;
  updatePeriod(start: string, patch: { start?: string; end?: string | null; excluded?: boolean }): void;
  deletePeriod(start: string): void;
  setCycleLog(log: CycleDayLog): void;
  setCycleReminders(reminders: CycleReminder[]): void;
  updateCycle(patch: Partial<Omit<Settings['cycle'], 'history' | 'reminders'>>): void;
  /** Forget every period and day log. */
  clearCycle(): void;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

const PLACEHOLDER: TrackerState = buildEmptyState('1970-01-01');
/** A failed save is retried a few times on its own (a busy database, a brief I/O hiccup) before waiting for the next change. */
const MAX_SAVE_RETRIES = 5;
const SAVE_RETRY_MS = 2000;

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
  // The phone's zone can change while the app is open (travel); refreshed with the clock.
  const [zone, setZone] = useState(() => currentZone());

  const storeRef = useRef<TrackerStore | null>(null);
  /** What the database holds, as far as we know: the base every persist diffs from. */
  const committedRef = useRef<TrackerState | null>(null);
  /** The newest state that should end up in the database. */
  const targetRef = useRef<TrackerState | null>(null);
  const flushRef = useRef<Promise<boolean>>(Promise.resolve(false));
  const reloadingRef = useRef(false);
  const flushingRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);
  /** Headless revision we last loaded (see services/replan). */
  const seenRevisionRef = useRef<number | null>(null);

  /**
   * Write everything between the committed state and the newest state, in one
   * diff per pass. The base only moves once a write succeeded, so a failed
   * write is retried from the same base by the next pass instead of leaving a
   * hole between what the screen shows and what the database holds.
   */
  const flush = useCallback((): Promise<boolean> => {
    if (flushingRef.current) return flushRef.current;
    const store = storeRef.current;
    if (!store) return Promise.resolve(false);
    flushingRef.current = true;
    const run = (async (): Promise<boolean> => {
      try {
        while (committedRef.current && targetRef.current && targetRef.current !== committedRef.current) {
          const base = committedRef.current;
          const target = targetRef.current;
          try {
            await store.persist(base, target);
            committedRef.current = target;
            failuresRef.current = 0;
            setStorageError((e) => (e && e.startsWith('Could not save') ? null : e));
          } catch (err) {
            failuresRef.current += 1;
            console.error('Failed to save', err);
            setStorageError(`Could not save your last change: ${describe(err)}`);
            if (failuresRef.current <= MAX_SAVE_RETRIES && retryRef.current === null) {
              retryRef.current = setTimeout(() => {
                retryRef.current = null;
                void flush();
              }, SAVE_RETRY_MS);
            }
            break;
          }
        }
        // True only when everything the screen shows is in the database.
        return committedRef.current === targetRef.current;
      } finally {
        flushingRef.current = false;
      }
    })();
    flushRef.current = run;
    return run;
  }, []);

  /**
   * Pick up rows a headless writer (notification button, widget, background re-plan) added.
   * Never hydrates over unsaved changes: a failed flush keeps its retry loop and the revision
   * stays "unseen", so the next check tries again once the save went through.
   */
  const reloadIfHeadlessChanged = useCallback(async () => {
    const store = storeRef.current;
    if (!store || seenRevisionRef.current === null || reloadingRef.current) return;
    const revision = await headlessRevision();
    if (revision === seenRevisionRef.current) return;
    reloadingRef.current = true;
    try {
      // Our own pending writes first, then read; repeat if the user changed something meanwhile,
      // so the reloaded state never hides a change that is already in the database.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!(await flush())) return;
        const before = targetRef.current;
        const fresh = await store.load();
        if (!fresh) return;
        if (targetRef.current !== before) continue;
        seenRevisionRef.current = revision;
        committedRef.current = fresh;
        targetRef.current = fresh;
        dispatch({ type: 'HYDRATE', state: fresh });
        return;
      }
    } finally {
      reloadingRef.current = false;
    }
  }, [flush]);

  // Open the store and hydrate. A fresh install starts empty (onboarding takes over).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await createStore();
        // Revision before the load: a headless write that lands between the two bumps it, and
        // the next check reloads. Reading it afterwards could mark such a write as already seen.
        const revisionBefore = await headlessRevision();
        let next = await store.load();
        if (cancelled) return;
        if (!next) {
          next = buildEmptyState(trackingDayOf(now(), currentZone()));
          await store.replace(next);
        }
        seenRevisionRef.current = revisionBefore;
        if (cancelled) return;
        storeRef.current = store;
        committedRef.current = next;
        targetRef.current = next;
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
      if (retryRef.current !== null) clearTimeout(retryRef.current);
    };
  }, []);

  // Persist every change after hydration, in order, writing only what changed.
  useEffect(() => {
    if (!storeRef.current || !committedRef.current || state === committedRef.current) return;
    targetRef.current = state;
    void flush();
  }, [state, flush]);

  // Clock: refresh every 30 s and whenever the app returns to the foreground.
  // Headless writers (notification button, widget, background re-plan) are picked up on
  // foreground, on every tick while active, right away when they run on this runtime, and once
  // more a few seconds after foregrounding (a write that was still finishing when we woke).
  useEffect(() => {
    const tick = () => {
      setNowMs(now());
      const z = currentZone();
      setZone((old) => (old === z ? old : z));
    };
    const reload = () => reloadIfHeadlessChanged().catch((err) => console.warn('Reload after background change failed', err));
    const interval = setInterval(() => {
      tick();
      if (AppState.currentState === 'active') void reload();
    }, 30_000);
    let late: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      tick();
      void reload();
      if (late !== null) clearTimeout(late);
      late = setTimeout(() => void reload(), 4_000);
    });
    const unsubscribe = onHeadlessWrite(() => void reload());
    return () => {
      clearInterval(interval);
      if (late !== null) clearTimeout(late);
      sub.remove();
      unsubscribe();
    };
  }, [reloadIfHeadlessChanged]);

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
        // The water goal lives twice: as a setting (Today's hydration card, the planner) and as the
        // Water habit's versioned target (completion, streaks, the widget). Keep them one number.
        if (patch.waterGoalMl !== undefined) {
          const { day } = stamp();
          const water = stateRef().habits.find((h) => h.presetId === 'water');
          if (water) {
            const base = currentRule(water, day);
            const target = Math.max(1, Math.round(patch.waterGoalMl));
            if (base.target !== target) dispatch({ type: 'SET_RULE', rule: { ...base, effectiveFrom: day, target } });
          }
        }
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
            ...(choices.cloudBackup !== undefined ? { cloudBackup: choices.cloudBackup } : {}),
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
        const today = calendarDayOf(now(), zone);
        const cycle = stateRef().settings.cycle;
        const result = applyPeriodStart(cycle.history, day ?? today, cycle, today);
        if (!result.ok) return result.reason;
        dispatch({ type: 'PERIOD_START', day: day ?? today, today });
        return null;
      },
      periodEnd(day) {
        dispatch({ type: 'PERIOD_END', day: day ?? calendarDayOf(now(), zone) });
      },
      updatePeriod(start, patch) {
        dispatch({ type: 'UPDATE_PERIOD', start, patch });
      },
      deletePeriod(start) {
        dispatch({ type: 'DELETE_PERIOD', start });
      },
      setCycleLog(log) {
        dispatch({ type: 'SET_CYCLE_LOG', log });
      },
      setCycleReminders(reminders) {
        dispatch({ type: 'UPDATE_SETTINGS', patch: { cycle: { ...stateRef().settings.cycle, reminders } } });
      },
      updateCycle(patch) {
        dispatch({ type: 'UPDATE_SETTINGS', patch: { cycle: { ...stateRef().settings.cycle, ...patch } } });
      },
      clearCycle() {
        dispatch({ type: 'CLEAR_CYCLE' });
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
