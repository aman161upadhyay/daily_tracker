import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createStore } from '@/src/data/createStore';
import { MAX_WATER_LOG_ML, WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from '@/src/data/validate';
import { withHeadlessLock } from '@/src/services/headlessLock';
import { headlessRevision, onHeadlessWrite } from '@/src/services/replan';
import type { TrackerStore } from '@/src/data/store';
import type { Cadence, Category, CycleDayLog, CycleReminder, Habit, HabitIcon, HabitRule, HabitType, MindKind, MovementSnack, NudgePolicy, Settings, SnackTrigger, SnackType } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import { applyPeriodStart } from '@/src/domain/cycle/timeline';
import { currentZone, newId, now } from '@/src/domain/time/clock';
import { calendarDayOf, instantOf, minutesOfDay, trackingDayOf } from '@/src/domain/time/trackingDay';
import { presetById } from '@/src/library/presets';
import { mindSessionExists, ruleChangeActions, ruleInForce, targetChangeActions, type RuleDraft } from './commands';
import { reducer, type Action } from './reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from './seed';
import { bumpBodyEpoch } from './epochs';
import { setLiveStore, type LiveStore } from './liveStore';
import { SaveQueue } from './saveQueue';
import { latestRule } from './selectors';
import type { TrackerState } from './types';

/** Most snacks one log can add (a day has room for a few dozen two-minute snacks, not thousands). */
export const MAX_SNACKS_PER_LOG = 100;

export interface TrackerContextValue {
  state: TrackerState;
  /** True once saved data is loaded and this provider is the writer. Stays false after a failed load (see loadError). */
  ready: boolean;
  /** Set when loading or saving failed; the UI shows it instead of guessing. */
  storageError: string | null;
  /**
   * The database could not be opened or read at start: nothing is loaded, nothing is written and
   * no reminder or widget bookkeeping runs (an empty placeholder must not cancel real reminders).
   * The UI offers to try again (retryLoad).
   */
  loadError: string | null;
  retryLoad(): void;
  nowMs: number;
  zone: string;
  /**
   * Counts the times the whole state was replaced (erase, restore, sample data) in this runtime.
   * Whatever keeps bookkeeping about the previous state — the notification service's delivery
   * journal — forgets it when this moves.
   */
  replaceEpoch: number;
  /**
   * True from a whole-state replace (erase, restore, sample data) until the database holds it.
   * The notification scheduler waits for it: until then the database, and the service record
   * beside it, still belong to the old state.
   */
  replacePending: boolean;
  /** How many replaces so far, read synchronously: a fence for work that spans awaits (see NudgeScheduler). */
  replaceSeq(): number;
  /** Tracking day (3 am boundary by default). */
  today: string;
  /** Calendar day (midnight boundary) for cycle data. */
  calendarToday: string;
  nowMin: number;
  dispatch: React.Dispatch<Action>;
  /** Build actions from the newest state and apply them as one change; resolves once they are saved. */
  apply(build: (state: TrackerState) => Action[]): Promise<{ next: TrackerState; applied: boolean; persisted: boolean }>;
  actions: TrackerActions;
  /**
   * Resolves once everything dispatched so far is in the database (false when
   * that save failed and is being retried). For callers that must not report
   * "done" before the write is durable, such as a notification button.
   */
  commitPending(): Promise<boolean>;
  /** What the database holds, as far as this provider knows (the rendered state while a save is in flight is newer). */
  committed(): TrackerState;
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
  /** Log a session; `endAt` is the instant it really ended (a timer that ran out while the phone was locked), now by default. */
  logMind(kind: MindKind, minutes: number, opts?: { endAt?: number }): void;
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

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const inner = cause instanceof Error ? ` (${cause.message})` : '';
    return `${err.message}${inner}`;
  }
  return String(err);
}

/** The Water habit's target and the `waterGoalMl` setting are one number, inside the bounds both sides accept. */
const clampWaterGoal = (ml: number) => Math.min(WATER_GOAL_MAX_ML, Math.max(WATER_GOAL_MIN_ML, Math.round(ml)));
/** A drink as a whole number of ml inside the shared ceiling, or null for anything that is not a drink. */
const drinkMl = (ml: number): number | null => {
  if (!Number.isFinite(ml)) return null;
  const whole = Math.round(ml);
  return whole >= 1 && whole <= MAX_WATER_LOG_ML ? whole : null;
};

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [state, setRendered] = useState(PLACEHOLDER);
  /**
   * The newest state: every dispatch so far folded in, synchronously. React renders it a moment
   * later; anything that decides what to do next (an action, a widget tap, a notification button
   * arriving while a render is pending) reads this, never the rendered copy, so two commands in
   * the same tick see each other.
   */
  const pendingRef = useRef(PLACEHOLDER);
  /** Changes so far (a dispatch that changed nothing is not one), and which change each state is. */
  const genRef = useRef(0);
  const genOf = useRef(new WeakMap<TrackerState, number>());
  /** Make `next` the newest state. Every state change goes through here. */
  const publish = useCallback((next: TrackerState) => {
    if (next === pendingRef.current) return false;
    genRef.current += 1;
    genOf.current.set(next, genRef.current);
    pendingRef.current = next;
    setRendered(next);
    return true;
  }, []);
  const dispatch = useCallback((action: Action) => void publish(reducer(pendingRef.current, action)), [publish]);
  /** Change folded into the `state` being rendered (0 for the placeholder). */
  const renderGen = genOf.current.get(state) ?? 0;
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  }, []);
  const [replaceEpoch, setReplaceEpoch] = useState(0);
  const [replacePending, setReplacePending] = useState(false);
  const replaceSeqRef = useRef(0);
  const replaceSeq = useCallback(() => replaceSeqRef.current, []);
  /**
   * The writes: what the database holds, the newest state that should end up there, retries and
   * who waits for a commit (see saveQueue). One queue per hydration; the previous one is retired
   * when this provider goes away or loads again, so a save it still had pending cannot land over
   * a newer provider's state (the error boundary's reset mounts a new provider) or across an erase.
   */
  const queueRef = useRef<SaveQueue>(null as unknown as SaveQueue);
  const newQueue = () =>
    new SaveQueue({
      onSaved: () => setStorageError((e) => (e && e.startsWith('Could not save') ? null : e)),
      onFailed: (err) => {
        console.error('Failed to save', err);
        setStorageError(`Could not save your last change: ${describe(err)}`);
      },
      onReplaceCommitted: () => setReplacePending(false),
    });
  if (!queueRef.current) queueRef.current = newQueue();
  const committed = useCallback(() => queueRef.current.committed ?? pendingRef.current, []);
  const liveStoreFor = (apply: LiveStore['apply']): LiveStore => ({
    apply,
    current: () => pendingRef.current,
    committed,
    replaceSeq,
    replacePending: () => queueRef.current.replacePending,
  });
  const [nowMs, setNowMs] = useState(() => now());
  // The phone's zone can change while the app is open (travel); refreshed with the clock.
  const [zone, setZone] = useState(() => currentZone());

  const storeRef = useRef<TrackerStore | null>(null);
  const reloadingRef = useRef(false);
  /** Headless revision we last loaded (see services/replan). */
  const seenRevisionRef = useRef<number | null>(null);

  /** Write everything between the committed state and the newest state (see saveQueue). */
  const flush = useCallback((): Promise<boolean> => queueRef.current.flush(), []);

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
      // so the reloaded state never hides a change that is already in the database. "Changed"
      // is judged by the dispatch counter (bumped synchronously at dispatch time), not only by
      // the persisted target, which trails a dispatch by a render.
      for (let attempt = 0; attempt < 3; attempt++) {
        const queue = queueRef.current;
        const genBefore = genRef.current;
        if (!(await flush())) return;
        const before = queue.target;
        const fresh = await store.load();
        if (!fresh) return;
        if (queue.disposed) return;
        if (queue.target !== before || genRef.current !== genBefore || queue.targetGen !== genBefore) continue;
        seenRevisionRef.current = revision;
        dispatch({ type: 'HYDRATE', state: fresh });
        queue.rebase(fresh, genRef.current);
        return;
      }
    } finally {
      reloadingRef.current = false;
    }
  }, [flush, dispatch]);

  /**
   * True once every change so far has been written (false when the save gave up). Every change
   * is rendered and persisted (a dispatch that changes nothing is not a change), so the wait
   * always ends: with the write, when the save gives up, or when the provider goes away.
   */
  const commitPending = useCallback((): Promise<boolean> => queueRef.current.commitPending(genRef.current), []);

  /**
   * Compute actions from the newest state and apply them as one change. Used by the live store
   * (widget taps, notification buttons, the background re-plan while the app is alive) and by the
   * in-app notification listener, so a press never decides against a state a render behind.
   */
  const apply = useCallback(
    async (build: (state: TrackerState) => Action[]): Promise<{ next: TrackerState; applied: boolean; persisted: boolean }> => {
      const base = pendingRef.current;
      let next = base;
      for (const a of build(base)) next = reducer(next, a);
      const applied = publish(next);
      // An empty or no-op build still waits for earlier changes: the caller is about to report "done".
      return { next, applied, persisted: await commitPending() };
    },
    [publish, commitPending],
  );

  // Open the store and hydrate. A fresh install starts empty (onboarding takes over).
  useEffect(() => {
    let cancelled = false;
    // A fresh queue per attempt: the previous one (a failed load, or the dev-time double mount)
    // is retired below and stays retired.
    if (queueRef.current.disposed) queueRef.current = newQueue();
    const queue = queueRef.current;
    (async () => {
      try {
        // Under the headless writers' lock: a widget tap or notification button that is halfway
        // through its own load → write finishes first, and once we are registered as the live
        // store no headless job can start a database write of its own. Without this a job that
        // passed its "app not alive" check could write a stale state after we took over.
        await withHeadlessLock(async () => {
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
          dispatch({ type: 'HYDRATE', state: next });
          queue.attach(store, next, genRef.current);
          setLiveStore(liveStoreFor(apply));
        });
        if (!cancelled) setReady(true);
      } catch (err) {
        console.error('Storage failed to open', err);
        // Not ready: the screens, the reminder scheduler and the widget sync stay off an empty
        // placeholder (it would read as "no reminders planned" and cancel the real ones). The
        // layout shows the error and offers to try again.
        if (!cancelled) setLoadError(describe(err));
      }
    })();
    return () => {
      cancelled = true;
      storeRef.current = null;
      queue.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt]);

  // Persist every change after hydration, in order, writing only what changed.
  useEffect(() => {
    const queue = queueRef.current;
    if (!queue.attached || !queue.committed || state === queue.committed) return;
    queue.setTarget(state, renderGen);
    void queue.flush();
  }, [state, renderGen]);

  // While this store is alive it is the only writer on this runtime: a widget tap or a
  // notification button that runs here goes through the reducer instead of racing our saves.
  useEffect(() => {
    if (!ready || !storeRef.current) return;
    setLiveStore(liveStoreFor(apply));
    return () => setLiveStore(null);
  }, [ready, apply]);

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

  /** Make `next` the whole state (erase, restore, sample data); see SaveQueue.markReplace. */
  const replaceWith = useCallback(
    (next: TrackerState) => {
      bumpBodyEpoch();
      replaceSeqRef.current += 1;
      setReplaceEpoch((n) => n + 1);
      setReplacePending(true);
      dispatch({ type: 'REPLACE', state: next });
      queueRef.current.markReplace(genRef.current);
    },
    [dispatch],
  );

  const actions = useMemo<TrackerActions>(() => {
    // The newest state, not the rendered one: an action right after another sees it.
    const stateRef = () => pendingRef.current;

    const logFor = (habit: Habit, value: number, day?: string) => {
      const { at, zone: z, day: d } = stamp(day);
      if (habit.presetId === 'water') {
        // The sheets refuse above the ceiling before this; a caller that did not is refused here,
        // so no path writes a drink the notification buttons and the import would not accept.
        const ml = drinkMl(value);
        if (ml !== null) dispatch({ type: 'ADD_WATER', entry: { id: newId(), at, zone: z, day: d, ml, source: 'MANUAL' } });
        return;
      }
      if (habit.snackType) {
        const meta = SNACK_LABELS[habit.snackType];
        const trigger: SnackTrigger = habit.presetId === 'sugar-shield' ? 'SUGAR_SHIELD' : 'MANUAL';
        // A snack count becomes that many rows (each a real snack with its own undo); capped so a typo
        // never turns into a million rows — the sheet refuses above the cap before it gets here.
        const count = Math.min(MAX_SNACKS_PER_LOG, Math.max(1, Math.round(value)));
        const snacks: MovementSnack[] = [];
        for (let i = 0; i < count; i++) snacks.push({ id: newId(), at: at + i, zone: z, day: d, type: habit.snackType, reps: meta.defaultReps, seconds: meta.defaultSeconds, trigger });
        dispatch({ type: 'LOG_SNACKS', snacks });
        return;
      }
      if (habit.mindKind) {
        const minutes = Math.max(1, Math.round(value));
        dispatch({ type: 'LOG_MIND', session: { id: newId(), startAt: at - minutes * 60_000, endAt: at, zone: z, day: d, kind: habit.mindKind, minutes } });
        return;
      }
      dispatch({ type: 'ADD_ENTRY', entry: { id: newId(), habitId: habit.id, day: d, at, zone: z, value, source: 'MANUAL' } });
    };

    /**
     * The water goal lives twice: as a setting (Today's hydration card, the planner) and as the
     * Water habit's versioned target (completion, streaks, the widget). One number, inside the
     * bounds both sides accept, whichever side was edited (see `targetChangeActions` for how a
     * rhythm planned for later is treated).
     */
    const syncWaterGoal = (ml: number) => {
      const goal = clampWaterGoal(ml);
      const { day } = stamp();
      const s = stateRef();
      const water = s.habits.find((h) => h.presetId === 'water');
      if (water) for (const a of targetChangeActions(s, water, goal, day)) dispatch(a);
      if (s.settings.waterGoalMl !== goal) dispatch({ type: 'UPDATE_SETTINGS', patch: { waterGoalMl: goal } });
    };

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
        const whole = drinkMl(ml);
        if (whole === null) return;
        const { at, zone: z, day } = stamp();
        dispatch({ type: 'ADD_WATER', entry: { id: newId(), at, zone: z, day, ml: whole, source } });
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
      logMind(kind, minutes, opts) {
        const { at, zone: z, day } = stamp();
        // A session belongs to the day it ended on: a timer that ran out at 02:53 and was seen at
        // 03:10 counts for the evening before, exactly as the end bell's own log would.
        const endAt = opts?.endAt ?? at;
        const d = endAt === at ? day : trackingDayOf(endAt, z, boundary);
        const startAt = endAt - minutes * 60_000;
        // The end bell may have logged this very session already (tapped while the screen's clock
        // was paused by the OS); the same dedupe the bell uses, against the newest state.
        if (mindSessionExists(pendingRef.current, kind, startAt)) return;
        dispatch({ type: 'LOG_MIND', session: { id: newId(), startAt, endAt, zone: z, day: d, kind, minutes } });
      },
      addPreset(presetId) {
        const preset = presetById(presetId);
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

        const next: RuleDraft = {
          cadence: draft.cadence,
          timesPerPeriod: draft.cadence === 'DAILY' ? 1 : Math.max(1, Math.round(draft.timesPerPeriod)),
          target: habit.type === 'YES_NO' ? 1 : Math.max(1, Math.round(draft.target)),
          freezesPerMonth: Math.max(0, Math.round(draft.freezesPerMonth)),
        };
        const before = ruleInForce(stateRef(), habit.id, day).target;
        for (const a of ruleChangeActions(stateRef(), habit, next, day)) dispatch(a);
        if (habit.presetId === 'water' && next.target !== before) syncWaterGoal(next.target);
      },
      updateHabit(id, patch) {
        dispatch({ type: 'UPDATE_HABIT', id, patch });
      },
      deleteHabit(id) {
        dispatch({ type: 'DELETE_HABIT', id });
      },
      setTarget(habit, target) {
        if (habit.presetId === 'water') return syncWaterGoal(target);
        const { day } = stamp();
        for (const a of targetChangeActions(stateRef(), habit, Math.max(1, Math.round(target)), day)) dispatch(a);
      },
      setPolicy(policy) {
        dispatch({ type: 'SET_POLICY', policy });
      },
      updateSettings(patch) {
        if (patch.waterGoalMl !== undefined) {
          const { waterGoalMl, ...rest } = patch;
          syncWaterGoal(waterGoalMl);
          patch = rest;
          if (Object.keys(patch).length === 0) return;
        }
        // Turning the import off withdraws it: a read still in flight must not add rows afterwards.
        if (patch.healthConnectEnabled === false) bumpBodyEpoch();
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
            ...(choices.cloudBackup !== undefined ? { cloudBackup: choices.cloudBackup } : {}),
            onboardingDone: true,
          },
        });
        const wanted = new Set(choices.presetIds);
        for (const h of s.habits) {
          if (h.presetId && !wanted.has(h.presetId) && !h.archived) dispatch({ type: 'UPDATE_HABIT', id: h.id, patch: { archived: true } });
        }
        for (const presetId of choices.presetIds) {
          const preset = presetById(presetId);
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
        replaceWith(buildEmptyState(stamp().day, { ...stateRef().settings, onboardingDone: true }));
      },
      loadSample() {
        const t = now();
        replaceWith(buildSampleState(trackingDayOf(t, zone, boundary), zone, t));
      },
      importState(next) {
        replaceWith({ ...next, settings: { ...next.settings, onboardingDone: true } });
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
  }, [stamp, zone, boundary, replaceWith]);

  const value = useMemo<TrackerContextValue>(
    () => ({ state, ready, storageError, loadError, retryLoad, nowMs, zone, replaceEpoch, replacePending, replaceSeq, today, calendarToday, nowMin, dispatch, apply, actions, commitPending, committed }),
    [state, ready, storageError, loadError, retryLoad, nowMs, zone, replaceEpoch, replacePending, replaceSeq, today, calendarToday, nowMin, dispatch, apply, actions, commitPending, committed],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTracker must be used inside TrackerProvider');
  return ctx;
}
