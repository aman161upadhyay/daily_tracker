/**
 * Pure derived data over TrackerState. No React here; hooks in
 * TrackerProvider wrap these with memoization.
 */
import { adherenceStage, type AdherenceStage } from '@/src/domain/adherence/adherenceScale';
import {
  adherenceOf,
  percentChange,
  ratioOf,
  type DayRatio,
} from '@/src/domain/habits/progress';
import { cadenceSegments, evaluateStreak, periodBounds, periodRequired, periodStartOf, segmentStartIn, type CadenceSegment, type PeriodResult } from '@/src/domain/habits/streaks';
import type { Cadence, Category, Habit, HabitEntry, HabitRule, MovementSnack, NudgePolicy, SnackType } from '@/src/domain/models';
import { SHIELD_EVENT_HABIT_ID, SNACK_LABELS } from '@/src/domain/models';
import { habitSymptomCorrelations, symptomPatterns, type CompletedCycle, type Correlation, type HabitPerCycle, type SymptomPattern } from '@/src/domain/cycle/insights';
import { upcomingReminders, type ReminderFire } from '@/src/domain/cycle/reminders';
import { buildTimeline, cycleLengths, isPeriodOpen, type CycleTimeline } from '@/src/domain/cycle/timeline';
import { nextNudge, nextRotationItem, type NextNudge, type RotationItem } from '@/src/domain/nudges/nextNudge';
import { planNudges, type PlanHabit, type PlanInput, type ScheduledNudge } from '@/src/domain/nudges/planner';
import { formatVolume } from '@/src/domain/time/format';
import { addDays, calendarDayOf, dayDiff, lastNDays, minutesOfDay, weekStartIndex } from '@/src/domain/time/trackingDay';
import { waterStatus, type WaterStatus } from '@/src/domain/water/pace';
import type { TrackerState } from './types';
import { snackCountsFor } from '@/src/domain/habits/snackMatch';

// ── Rules & policies ───────────────────────────────────────────────────────

// Per-state caches. State objects are immutable, so a WeakMap keyed by the
// state gives each render pass O(1) lookups after one O(n) index build.
const rulesCache = new WeakMap<TrackerState, Map<string, HabitRule[]>>();
const valuesCache = new WeakMap<TrackerState, Map<string, Map<string, number>>>();
const entriesIndex = new WeakMap<TrackerState, Map<string, HabitEntry[]>>();
const NO_ENTRIES: readonly HabitEntry[] = [];

/** A habit's own entries, from a per-state index built on the first ask. */
function entriesOf(state: TrackerState, habitId: string): readonly HabitEntry[] {
  let index = entriesIndex.get(state);
  if (!index) {
    index = new Map();
    for (const e of state.entries) {
      const list = index.get(e.habitId);
      if (list) list.push(e);
      else index.set(e.habitId, [e]);
    }
    entriesIndex.set(state, index);
  }
  return index.get(habitId) ?? NO_ENTRIES;
}

/**
 * The log a habit's figures come from: its own entries, or the shared water, snack or mind log.
 * Views and day values are memoised against this slice, so a water tap leaves the other habits'
 * cached views (and their streak walks) alone.
 */
function logSlice(state: TrackerState, habit: Habit): readonly unknown[] {
  if (habit.presetId === 'water') return state.water;
  if (habit.snackType) return state.snacks;
  if (habit.mindKind) return state.mind;
  return entriesOf(state, habit.id);
}

/** Same rows in the same order (the per-habit entry slice is rebuilt per state; its rows are not). */
function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Rules of one habit, oldest first. */
export function rulesFor(state: TrackerState, habitId: string): HabitRule[] {
  let perState = rulesCache.get(state);
  if (!perState) {
    perState = new Map();
    rulesCache.set(state, perState);
  }
  let rules = perState.get(habitId);
  if (!rules) {
    rules = state.rules.filter((r) => r.habitId === habitId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
    perState.set(habitId, rules);
  }
  return rules;
}

export function ruleFor(state: TrackerState, habitId: string, day: string): HabitRule | undefined {
  const rules = rulesFor(state, habitId);
  if (rules.length === 0) return undefined;
  let chosen = rules[0]!;
  for (const r of rules) if (r.effectiveFrom <= day) chosen = r;
  return chosen;
}

/** Latest rule of a habit (what the editor shows). */
export function latestRule(state: TrackerState, habitId: string): HabitRule | undefined {
  const rules = rulesFor(state, habitId);
  return rules[rules.length - 1];
}

export function policyFor(state: TrackerState, habitId: string): NudgePolicy | undefined {
  return state.policies.find((p) => p.habitId === habitId);
}

// ── Per-day values ─────────────────────────────────────────────────────────

function isSugarShield(habit: Habit): boolean {
  return habit.presetId === 'sugar-shield';
}

export { snackCountsFor };

/** day → value for one habit, from whichever log it lives in (cached per state). */
export function dayValues(state: TrackerState, habit: Habit): Map<string, number> {
  let perState = valuesCache.get(state);
  if (!perState) {
    perState = new Map();
    valuesCache.set(state, perState);
  }
  const key =
    habit.presetId === 'water'
      ? 'water'
      : habit.snackType
        ? `snack:${habit.snackType}:${isSugarShield(habit) ? 'sugar' : 'plain'}`
        : habit.mindKind
          ? `mind:${habit.mindKind}`
          : `habit:${habit.id}:${habit.type}`;
  const cached = perState.get(key);
  if (cached) return cached;
  // Across states: the same slice of the log gives the same values, whatever else changed.
  const slice = logSlice(state, habit);
  const memo = valuesMemo.get(habit);
  if (memo && sameList(memo.slice, slice)) {
    perState.set(key, memo.values);
    return memo.values;
  }

  const m = new Map<string, number>();
  const add = (day: string, v: number) => m.set(day, (m.get(day) ?? 0) + v);
  if (habit.presetId === 'water') {
    for (const w of state.water) add(w.day, w.ml);
  } else if (habit.snackType) {
    for (const s of state.snacks) if (snackCountsFor(habit, s)) add(s.day, 1);
  } else if (habit.mindKind) {
    for (const x of state.mind) if (x.kind === habit.mindKind) add(x.day, x.minutes);
  } else {
    for (const e of state.entries) if (e.habitId === habit.id) add(e.day, e.value);
    if (habit.type === 'YES_NO') for (const [day, v] of m) m.set(day, v > 0 ? 1 : 0);
  }
  perState.set(key, m);
  valuesMemo.set(habit, { slice, values: m });
  return m;
}

// Keyed by the habit object (a draft with the same id is another object): the values last built
// for it and the slice of the log they came from.
const valuesMemo = new WeakMap<Habit, { slice: readonly unknown[]; values: Map<string, number> }>();

/** Raw value of a habit on a day, derived from whichever log it lives in. */
export function habitDayValue(state: TrackerState, habit: Habit, day: string): number {
  return dayValues(state, habit).get(day) ?? 0;
}

// Cadence segments depend only on the habit's cadence history, which rarely changes, so they are
// cached by that history rather than per state: a water tap does not re-walk a year of periods,
// and a year of days asks one walk, not one per day.
const segmentCache = new Map<string, { walkedTo: string; segments: CadenceSegment[] }>();
const SEGMENT_CACHE_MAX = 256;

/** First day of the habit's cadence segment that contains `day` (creation, or where the current cadence took over). */
export function segmentFrom(state: TrackerState, habit: Habit, day: string): string {
  const rules = rulesFor(state, habit.id);
  if (rules.every((r) => r.cadence === rules[0]!.cadence)) return habit.createdDay;
  const weekStart = weekStartIndex(state.settings.weekStart);
  const key = `${habit.createdDay}|${weekStart}|${rules.map((r) => `${r.effectiveFrom}:${r.cadence}`).join(',')}`;
  let walked = segmentCache.get(key);
  if (!walked || walked.walkedTo < day) {
    if (!walked && segmentCache.size >= SEGMENT_CACHE_MAX) segmentCache.clear();
    // Walk a year past what was asked, so the next later day is a lookup too.
    const walkedTo = addDays(day, 366);
    walked = { walkedTo, segments: cadenceSegments(rules, habit.createdDay, walkedTo, weekStart) };
    segmentCache.set(key, walked);
  }
  return segmentStartIn(walked.segments, day, habit.createdDay);
}

/**
 * Days met so far in the period (week or month) that `day` belongs to, counted from the period's
 * first day — or from the day the current cadence took over, when that is later — up to `day`.
 */
export function periodDoneOn(state: TrackerState, habit: Habit, cadence: Cadence, day: string): number {
  let done = 0;
  const from = segmentFrom(state, habit, day);
  const start = periodStartOf(cadence, day, weekStartIndex(state.settings.weekStart));
  for (let d = from > start ? from : start; d <= day; d = addDays(d, 1)) {
    const target = ruleFor(state, habit.id, d)?.target ?? 1;
    if (habitDayValue(state, habit, d) >= target) done++;
  }
  return done;
}

/**
 * Per-day ratios for a list of days (oldest → newest). Weekly and monthly
 * habits use the period-to-date count, counted from the real start of the
 * period rather than from the first day of the window asked for.
 */
export function habitRatios(state: TrackerState, habit: Habit, days: string[]): DayRatio[] {
  const out: DayRatio[] = [];
  // Consecutive days of one period (same rule, same segment) extend the previous day's count by
  // one check and keep its quota, instead of re-counting the period from its start for each day
  // (a month of days is 30 checks, not 465) and re-measuring the period each time.
  let prev: { day: string; end: string; from: string; rule: HabitRule; done: number; required: number } | null = null;
  const weekStart = weekStartIndex(state.settings.weekStart);
  for (const day of days) {
    const rule = ruleFor(state, habit.id, day);
    const target = rule?.target ?? 1;
    const value = habitDayValue(state, habit, day);
    if (rule && rule.cadence !== 'DAILY') {
      const from = segmentFrom(state, habit, day);
      if (prev && prev.rule === rule && prev.from === from && day <= prev.end && addDays(prev.day, 1) === day) {
        prev.day = day;
        prev.done += value >= target ? 1 : 0;
      } else {
        prev = { day, end: periodBounds(rule.cadence, day, weekStart).end, from, rule, done: periodDoneOn(state, habit, rule.cadence, day), required: periodRequired(rule, day, from, undefined, weekStart) };
      }
      out.push({ day, value, target, ratio: ratioOf(prev.done, prev.required) });
    } else {
      prev = null;
      out.push({ day, value, target, ratio: ratioOf(value, target) });
    }
  }
  return out;
}

export interface HabitView {
  habit: Habit;
  rule: HabitRule;
  policy?: NudgePolicy;
  todayValue: number;
  target: number;
  /**
   * Progress of the thing the row is about: today's target for daily habits, the period's quota
   * ("2 of 4 this week") for weekly and monthly ones. Rings, bars and "done" chips read this.
   */
  todayRatio: number;
  /** Today's own log against today's per-day target — what the checkbox, "Undo today" and the planner mean by "done today". */
  doneToday: boolean;
  /** Today's own log as a ratio of today's per-day target, whatever the cadence. */
  dayRatio: number;
  adherence: number;
  stage: AdherenceStage;
  /** Streak in periods (days, weeks or months depending on the cadence). */
  streak: number;
  best: number;
  freezesLeftThisMonth: number;
  /** Scored periods, oldest first (for the backfill strip and the editor). */
  periods: PeriodResult[];
  /** Last 14 days, oldest first, ending today. */
  ratios14: DayRatio[];
  /** Period-to-date completed days for weekly / monthly habits. */
  periodDone?: number;
  /** Days this period asks for: `timesPerPeriod`, prorated to the days the habit has in it (its first, partial period). */
  periodQuota?: number;
  /** "this week" / "this month" for weekly / monthly habits. */
  periodLabel?: string;
}

// One view per habit and day per state: the Today list, highlights, the planner and the widget
// model all ask for the same views during one render pass.
const viewCache = new WeakMap<TrackerState, Map<string, HabitView>>();
// Across states, per habit object: a view stands as long as the habit's own rules, its own policy,
// its slice of the log and the day are the ones it was built from. A water tap, or a reminder edit
// on another habit, changes none of these for the other habits, so their streak walks are not
// repeated on the render thread (the whole-table identities would miss on every edit to any habit).
const viewMemo = new WeakMap<Habit, { rules: readonly HabitRule[]; policy: NudgePolicy | undefined; slice: readonly unknown[]; today: string; weekStart: number; view: HabitView }>();

export function habitView(state: TrackerState, habit: Habit, today: string): HabitView {
  let perState = viewCache.get(state);
  if (!perState) {
    perState = new Map();
    viewCache.set(state, perState);
  }
  const key = `${habit.id}|${today}`;
  const cached = perState.get(key);
  // Only a view of this very habit object counts (a draft with the same id must not get the stored one's view).
  if (cached && cached.habit === habit) return cached;
  const slice = logSlice(state, habit);
  const rules = rulesFor(state, habit.id);
  const policy = policyFor(state, habit.id);
  const memo = viewMemo.get(habit);
  // The week's first day moves every weekly quota and the strips, so it is part of the memo's key.
  const weekStart = weekStartIndex(state.settings.weekStart);
  const view =
    memo && memo.today === today && memo.weekStart === weekStart && memo.policy === policy && sameList(memo.rules, rules) && sameList(memo.slice, slice)
      ? memo.view
      : buildHabitView(state, habit, today);
  if (state.habits.includes(habit)) {
    perState.set(key, view);
    viewMemo.set(habit, { rules, policy, slice, today, weekStart, view });
  }
  return view;
}

function buildHabitView(state: TrackerState, habit: Habit, today: string): HabitView {
  const rule = ruleFor(state, habit.id, today) ?? {
    habitId: habit.id,
    effectiveFrom: habit.createdDay,
    cadence: 'DAILY',
    timesPerPeriod: 1,
    target: 1,
    freezesPerMonth: 0,
  };
  const ratios14 = habitRatios(state, habit, lastNDays(today, 14));
  const todayRatio = ratios14[ratios14.length - 1]!;
  const weekly = rule.cadence !== 'DAILY';
  const weekStart = weekStartIndex(state.settings.weekStart);
  const periodDone = weekly ? periodDoneOn(state, habit, rule.cadence, today) : undefined;
  const quota = weekly ? periodRequired(rule, today, segmentFrom(state, habit, today), undefined, weekStart) : undefined;
  const periodLabel = rule.cadence === 'WEEKLY' ? 'this week' : rule.cadence === 'MONTHLY' ? 'this month' : undefined;
  const adherence = adherenceOf(ratios14, habit.createdDay, today);
  const streaks = evaluateStreak({
    rules: rulesFor(state, habit.id),
    valueOf: (day) => habitDayValue(state, habit, day),
    createdDay: habit.createdDay,
    today,
    weekStart,
  });
  return {
    habit,
    rule,
    policy: policyFor(state, habit.id),
    todayValue: todayRatio.value,
    target: rule.target,
    todayRatio: weekly ? todayRatio.ratio : ratioOf(todayRatio.value, rule.target),
    doneToday: todayRatio.value >= rule.target,
    dayRatio: ratioOf(todayRatio.value, rule.target),
    adherence,
    stage: adherenceStage(adherence),
    streak: streaks.streak,
    best: streaks.best,
    freezesLeftThisMonth: streaks.freezesLeftThisMonth,
    periods: streaks.periods,
    ratios14,
    periodDone,
    periodQuota: quota,
    periodLabel,
  };
}

export function activeHabits(state: TrackerState): Habit[] {
  return state.habits.filter((h) => !h.archived);
}

export function waterHabit(state: TrackerState): Habit | undefined {
  return state.habits.find((h) => h.presetId === 'water' && !h.archived);
}

// ── Today summary ──────────────────────────────────────────────────────────

export interface TodaySummary {
  water: WaterStatus;
  snacksDone: number;
  snacksTarget: number;
  mindMinutes: number;
  mindTarget: number;
  /** The category has habits and asks nothing today because every week or month quota is met: "nothing due", not an untouched day. */
  snacksSettled: boolean;
  mindSettled: boolean;
  rings: { hydration: number; movement: number; mind: number };
}

/**
 * What a habit asks of `today` for the category rings: its per-day target, or nothing once a weekly
 * or monthly quota is met and the day was not started (a day actually started still counts, so a
 * fourth session in a three-day week fills its ring rather than vanishing).
 */
function askedToday(state: TrackerState, h: Habit, today: string): number {
  const rule = ruleFor(state, h.id, today);
  if (!rule) return 0;
  if (rule.cadence === 'DAILY') return rule.target;
  const view = habitView(state, h, today);
  const periodMet = (view.periodDone ?? 0) >= (view.periodQuota ?? 0);
  return !periodMet || view.todayValue > 0 ? rule.target : 0;
}

/** A weekly or monthly habit whose quota is met on a day not started: it owes nothing today. */
function quotaMetToday(state: TrackerState, h: Habit, today: string): boolean {
  const rule = ruleFor(state, h.id, today);
  if (!rule || rule.cadence === 'DAILY') return false;
  const view = habitView(state, h, today);
  return (view.periodDone ?? 0) >= (view.periodQuota ?? 0) && view.todayValue === 0;
}

/**
 * "Nothing due today" for a category: it has habits, none asks anything today, and at least one is
 * quiet because its week or month is met (not because it has no rule yet). A met quota draws a full
 * ring and says so; an empty 0 / 0 ring looked like an untouched day.
 */
function settledToday(state: TrackerState, habits: Habit[], today: string, target: number): boolean {
  return habits.length > 0 && target === 0 && habits.some((h) => quotaMetToday(state, h, today));
}

export function todaySummary(state: TrackerState, today: string, nowMs: number, zone: string): TodaySummary {
  const s = state.settings;
  // Minutes on the tracking day's own clock: between midnight and the day boundary the day's active
  // window has ended, so the expected intake is the whole goal — not a new morning's zero, which
  // would turn "1,750 ml behind" into "on pace" at 00:00 with nothing logged.
  const nowMin = minutesOfDay(nowMs, zone) + (calendarDayOf(nowMs, zone) > today ? 24 * 60 : 0);
  const loggedMl = state.water.reduce((acc, w) => (w.day === today ? acc + w.ml : acc), 0);
  const water = waterStatus(loggedMl, s.waterGoalMl, nowMin, s.activeStartMin, s.activeEndMin, s.tapSizeMl);

  // Today's movement ask: each habit's per-day target — a "3 climbs, 3 days a week" habit asks for
  // 3 climbs on a day it is done, not one — counted only while its week or month still needs days.
  // The Mind ring asks the same way: a weekly meditation done on Monday owes nothing on Tuesday.
  const movementHabits = activeHabits(state).filter((h) => h.snackType && !isSugarShield(h));
  const snacksTarget = movementHabits.reduce((acc, h) => acc + askedToday(state, h, today), 0);
  const snacksDone = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD').length;

  const mindHabits = activeHabits(state).filter((h) => h.mindKind);
  const mindTarget = mindHabits.reduce((acc, h) => acc + askedToday(state, h, today), 0);
  const mindMinutes = state.mind.reduce((acc, m) => (m.day === today ? acc + m.minutes : acc), 0);

  const snacksSettled = settledToday(state, movementHabits, today, snacksTarget);
  const mindSettled = settledToday(state, mindHabits, today, mindTarget);

  return {
    water,
    snacksDone,
    snacksTarget,
    mindMinutes,
    mindTarget,
    snacksSettled,
    mindSettled,
    rings: {
      hydration: ratioOf(loggedMl, s.waterGoalMl),
      movement: snacksSettled ? 1 : ratioOf(snacksDone, snacksTarget),
      mind: mindSettled ? 1 : ratioOf(mindMinutes, mindTarget),
    },
  };
}

// ── Live nudge ─────────────────────────────────────────────────────────────

export function rotationItems(state: TrackerState): RotationItem[] {
  return activeHabits(state)
    .filter((h) => h.snackType && !isSugarShield(h))
    .filter((h) => {
      const p = policyFor(state, h.id);
      return !p || (p.enabled && (p.kind === 'ROTATION' || p.kind === 'INTERVAL'));
    })
    .map((h) => ({ habitId: h.id, snackType: h.snackType as SnackType, label: h.name }));
}

/**
 * Movement habits whose reminder is on and rings at chosen times — outside the rotation the nudge
 * card follows. The card must not call these "off": the person chose their times.
 */
export function fixedMovementReminders(state: TrackerState): number {
  return activeHabits(state)
    .filter((h) => h.snackType && !isSugarShield(h))
    .filter((h) => {
      const p = policyFor(state, h.id);
      return !!p && p.enabled && p.kind === 'FIXED';
    }).length;
}

/** The snack habit the rotation suggests next (what a tap on the automatic movement tile logs). */
export function rotationHabit(state: TrackerState, today: string): Habit | undefined {
  const items = rotationItems(state);
  const completed = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD').length;
  const swap = state.nudgeSwap?.day === today ? state.nudgeSwap.offset : 0;
  const item = nextRotationItem(items, completed + swap);
  const id = item?.habitId;
  return id ? state.habits.find((h) => h.id === id && !h.archived) : undefined;
}

export function liveNudge(state: TrackerState, today: string, nowMs: number, zone: string): NextNudge | null {
  const s = state.settings;
  const nowMin = minutesOfDay(nowMs, zone);
  // Only habits with something left to do today take part: six sets logged at noon end the day's
  // movement nudges, on the card as in the shade.
  const items = rotationItems(state).filter((i) => {
    const habit = state.habits.find((h) => h.id === i.habitId);
    if (!habit) return false;
    const v = habitView(state, habit, today);
    return !(v.doneToday || (v.rule.cadence !== 'DAILY' && (v.periodDone ?? 0) >= (v.periodQuota ?? 0)));
  });
  if (items.length === 0) return null;
  const todaySnacks = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD');
  const last = todaySnacks.reduce<MovementSnack | null>((acc, x) => (!acc || x.at > acc.at ? x : acc), null);
  // The last snack and the snooze are placed by real minutes from now, not read off the wall clock:
  // on the autumn night the clock shows 01:45 twice, and a snooze "until 01:45" taken at the first
  // is sixty minutes away, not due. The active hours stay wall-clock, as they mean.
  const lastDoneMin = last ? nowMin - Math.floor((nowMs - last.at) / 60_000) : undefined;
  const snoozedUntilMin = state.nudgeSnoozedUntil && state.nudgeSnoozedUntil > nowMs ? nowMin + Math.ceil((state.nudgeSnoozedUntil - nowMs) / 60_000) : undefined;
  const swap = state.nudgeSwap?.day === today ? state.nudgeSwap.offset : 0;
  const legacy = nextNudge(
    { nowMin, activeStartMin: s.activeStartMin, activeEndMin: s.activeEndMin, intervalMin: s.nudgeIntervalMin, lastDoneMin, snoozedUntilMin },
    items,
    todaySnacks.length + swap,
  );
  if (!legacy) return null;
  // The due clock time is the one that instant shows (across the fold it is not now + the wait).
  const atClock = (n: NextNudge): NextNudge => ({ ...n, dueMin: minutesOfDay(nowMs + n.inMin * 60_000, zone) });
  if (!s.remindersEnabled) return atClock(legacy);
  // Agree with the first pending movement notification (snoozes and swaps made from a notification
  // are only known to the planner); an overdue slot still shows as "due now" on the card. When the
  // planner has nothing left to offer today — the cap is spent, the day is paused, every budget is
  // used — the card promises nothing either.
  const planned = nudgePlan(state, today, nowMs, zone).find((n) => n.day === today && (n.kind === 'ROTATION' || n.kind === 'WATER') && n.habitIds.some((id) => items.some((i) => i.habitId === id)));
  const item = planned && items.find((i) => planned.habitIds.includes(i.habitId));
  if (legacy.inMin === 0) return atClock(item ? { ...legacy, item } : legacy);
  if (!planned || !item) return null;
  return { dueMin: minutesOfDay(planned.at, zone), inMin: Math.max(0, Math.ceil((planned.at - nowMs) / 60_000)), item };
}

export function snackSuggestion(type: SnackType): string {
  const meta = SNACK_LABELS[type];
  if (meta.defaultReps) return `${meta.defaultReps} ${meta.label.toLowerCase()}`;
  if (meta.defaultSeconds) {
    const min = meta.defaultSeconds / 60;
    return `${min % 1 === 0 ? min : min.toFixed(1)}-min ${meta.label.toLowerCase()}`;
  }
  return meta.label;
}

// ── Series for charts ──────────────────────────────────────────────────────

export function habitSeries(state: TrackerState, habit: Habit, today: string, days: number): DayRatio[] {
  return habitRatios(state, habit, lastNDays(today, days));
}

export function waterSeries(state: TrackerState, today: string, days: number): number[] {
  return lastNDays(today, days).map((d) => state.water.reduce((acc, w) => (w.day === d ? acc + w.ml : acc), 0));
}

export function snackSeries(state: TrackerState, today: string, days: number): number[] {
  return lastNDays(today, days).map((d) => state.snacks.filter((s) => s.day === d && s.trigger !== 'SUGAR_SHIELD').length);
}

export function mindSeries(state: TrackerState, today: string, days: number): number[] {
  return lastNDays(today, days).map((d) => state.mind.reduce((acc, m) => (m.day === d ? acc + m.minutes : acc), 0));
}

/** Adherence-scale values for the 26-week heatmap: day → ratio. */
export function heatmapValues(state: TrackerState, habit: Habit, today: string): Record<string, number> {
  return ratiosByDay(state, habit, lastNDays(today, 26 * 7));
}

/** Done ratio per day for the days given (ascending), from the habit's first day on. */
export function ratiosByDay(state: TrackerState, habit: Habit, days: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of habitRatios(state, habit, days)) if (r.day >= habit.createdDay) out[r.day] = r.ratio;
  return out;
}

// ── Highlights ─────────────────────────────────────────────────────────────

export interface Highlight {
  id: string;
  title: string;
  body: string;
  category: Category;
  series?: number[];
  habitId?: string;
}

/** The period a streak counts: days, weeks or months. */
export function streakUnit(cadence: Cadence): 'day' | 'week' | 'month' {
  return cadence === 'DAILY' ? 'day' : cadence === 'WEEKLY' ? 'week' : 'month';
}

export function highlights(state: TrackerState, today: string): Highlight[] {
  const out: Highlight[] = [];
  const habits = activeHabits(state);
  const views = habits.map((h) => habitView(state, h, today));

  // Best current streak.
  const streaky = [...views].filter((v) => v.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
  if (streaky) {
    const unit = streakUnit(streaky.rule.cadence);
    out.push({
      id: 'streak',
      title: `${streaky.habit.name}: ${streaky.streak}-${unit} streak`,
      body: streaky.streak >= streaky.best ? 'That is your best run so far.' : `Best so far: ${streaky.best} ${unit}s.`,
      category: streaky.habit.category,
      series: streaky.ratios14.slice(-7).map((r) => r.ratio),
      habitId: streaky.habit.id,
    });
  }

  // Water: days logged this week and week-over-week change, in the units setting.
  const water = waterHabit(state);
  const volumeText = (ml: number) => {
    const f = formatVolume(Math.round(ml), state.settings.units);
    return `${f.value} ${f.unit}`;
  };
  if (water) {
    const last7 = lastNDays(today, 7);
    const prev7 = lastNDays(addDays(today, -7), 7);
    const cur = last7.map((d) => habitDayValue(state, water, d));
    const prev = prev7.map((d) => habitDayValue(state, water, d));
    const daysLogged = cur.filter((v) => v > 0).length;
    const change = percentChange(
      prev.reduce((a, b) => a + b, 0),
      cur.reduce((a, b) => a + b, 0),
    );
    // "On last week" only once last week was lived with the habit: on day 8 the previous window held
    // one real day and six that predate the install, and 2,000 ml against 5,500 read as "Up 175%".
    const livedBoth = dayDiff(water.createdDay, today) + 1 >= 14;
    const trend = change === null || !livedBoth ? '' : change >= 0 ? ` Up ${change}% on last week.` : ` Down ${Math.abs(change)}% on last week.`;
    // Two empty weeks are not a highlight (a fresh install read "0 of the last 7 days" as history it
    // did not have); one empty week after a logged one is said plainly.
    const prevTotal = prev.reduce((a, b) => a + b, 0);
    // The first week says what it has: "2 of your first 3 days", averaged over days that existed —
    // one drink on day one is not "1 of the last 7 days, 36 ml a day". Under three days, nothing yet.
    const observed = Math.min(7, dayDiff(water.createdDay, today) + 1);
    const total = cur.reduce((a, b) => a + b, 0);
    if (observed < 7) {
      if (observed >= 3 && daysLogged > 0) {
        out.push({
          id: 'water-week',
          title: `You logged water ${daysLogged} of your first ${observed} days`,
          body: `${volumeText(total / observed)} a day on average so far.`,
          category: 'hydration',
          series: cur.slice(-observed),
          habitId: water.id,
        });
      }
    } else if (daysLogged > 0 || prevTotal > 0) {
      out.push({
        id: 'water-week',
        title: daysLogged === 0 ? 'No water logged in the last 7 days' : `You logged water ${daysLogged} of the last 7 days`,
        body: daysLogged === 0 ? `Last week averaged ${volumeText(prevTotal / 7)} a day.` : `${volumeText(total / 7)} a day on average.${trend}`,
        category: 'hydration',
        series: cur,
        habitId: water.id,
      });
    }
  }

  // Habit with the biggest adherence climb over the last week. Both weeks must have been lived
  // with the habit: a habit created five days ago has no "last week" to have climbed from.
  const climber = views
    .map((v) => {
      const first = v.ratios14.slice(0, 7).filter((r) => r.day >= v.habit.createdDay);
      const last = v.ratios14.slice(7).filter((r) => r.day >= v.habit.createdDay);
      if (first.length < 4 || last.length < 4) return { v, delta: 0 };
      const a = first.reduce((x, r) => x + r.ratio, 0) / first.length;
      const b = last.reduce((x, r) => x + r.ratio, 0) / last.length;
      return { v, delta: b - a };
    })
    .filter((x) => x.delta >= 0.15)
    .sort((x, y) => y.delta - x.delta)[0];
  if (climber) {
    out.push({
      id: 'climber',
      title: `${climber.v.habit.name} is warming up`,
      body: `Completion up ${Math.round(climber.delta * 100)} points this week versus last.`,
      category: climber.v.habit.category,
      series: climber.v.ratios14.map((r) => r.ratio),
      habitId: climber.v.habit.id,
    });
  }

  // Movement snacks this week versus last.
  const snacksThisWeek = snackSeries(state, today, 7).reduce((a, b) => a + b, 0);
  const snacksLastWeek = snackSeries(state, addDays(today, -7), 7).reduce((a, b) => a + b, 0);
  if (snacksThisWeek > 0) {
    // The same rule for snacks: a comparison needs two lived weeks of movement habits.
    const firstMovementDay = state.habits.filter(isMovement).map((h) => h.createdDay).sort()[0];
    const livedBoth = firstMovementDay !== undefined && dayDiff(firstMovementDay, today) + 1 >= 14;
    const change = livedBoth ? percentChange(snacksLastWeek, snacksThisWeek) : null;
    out.push({
      id: 'snacks-week',
      title: `${snacksThisWeek} movement snacks this week`,
      body:
        change === null
          ? 'Every one of them counts as a sitting break.'
          : change >= 0
            ? `Up ${change}% on last week.`
            : `Down ${Math.abs(change)}% on last week.`,
      category: 'movement',
      series: snackSeries(state, today, 7),
    });
  }

  return out.slice(0, 3);
}

// ── Nudge plan (notifications) ─────────────────────────────────────────────

function isMovement(habit: Habit): boolean {
  return !!habit.snackType && !isSugarShield(habit);
}

/** Epoch ms of the last log that counts for this habit today, if any. */
export function lastLogMsToday(state: TrackerState, habit: Habit, today: string): number | undefined {
  let last: number | undefined;
  const take = (at: number) => {
    if (last === undefined || at > last) last = at;
  };
  if (habit.presetId === 'water') {
    for (const w of state.water) if (w.day === today) take(w.at);
    return last;
  }
  if (habit.snackType) {
    for (const x of state.snacks) if (x.day === today && snackCountsFor(habit, x)) take(x.at);
    return last;
  }
  if (habit.mindKind) {
    for (const m of state.mind) if (m.day === today && m.kind === habit.mindKind) take(m.endAt);
    return last;
  }
  for (const e of state.entries) if (e.day === today && e.habitId === habit.id) take(e.at);
  return last;
}

function planHabitOf(state: TrackerState, view: HabitView, today: string): PlanHabit | null {
  const { habit, rule, policy } = view;
  if (!policy || policy.kind === 'NONE' || policy.kind === 'EVENT' || policy.kind === 'CYCLE') return null;
  const donePeriod = rule.cadence !== 'DAILY' && (view.periodDone ?? 0) >= (view.periodQuota ?? 0);
  return compactPlanHabit({
    id: habit.id,
    name: habit.name,
    policy,
    snackType: habit.snackType,
    doneToday: view.doneToday,
    donePeriod,
    // A met quota settles the rest of the period: no "tomorrow" slots inside a week already done.
    ...(donePeriod ? { periodEndsOn: periodBounds(rule.cadence, today, weekStartIndex(state.settings.weekStart)).end } : {}),
    todayRatio: view.dayRatio,
    lastLogMs: lastLogMsToday(state, habit, today),
    movement: isMovement(habit),
  });
}

function compactPlanHabit(h: PlanHabit): PlanHabit {
  if (h.snackType === undefined) delete h.snackType;
  if (h.lastLogMs === undefined) delete h.lastLogMs;
  return h;
}

/** The weekly "Your week" notification text, rendered from the last 7 days. */
export function weekSummaryText(state: TrackerState, today: string): { title: string; body: string } {
  const habits = activeHabits(state);
  const days = lastNDays(today, 7);
  let hit = 0;
  let total = 0;
  let best: { name: string; streak: number; unit: string } | null = null;
  for (const h of habits) {
    const v = habitView(state, h, today);
    if (v.rule.cadence === 'DAILY') {
      const ratios = habitRatios(state, h, days).filter((r) => r.day >= h.createdDay);
      total += ratios.length;
      hit += ratios.filter((r) => r.ratio >= 1).length;
    } else if (v.rule.cadence === 'WEEKLY') {
      // A weekly habit is "3 of 4 this week", not seven daily misses.
      const quota = v.periodQuota ?? v.rule.timesPerPeriod;
      total += quota;
      hit += Math.min(quota, v.periodDone ?? 0);
    } else {
      // A monthly habit's month-to-date count says nothing about this week: count the days of
      // the week it was done, against the share of its month's quota that seven days hold.
      const quota = v.periodQuota ?? v.rule.timesPerPeriod;
      const share = Math.max(1, Math.round((quota * days.length) / periodBounds('MONTHLY', today).length));
      const done = days.filter((d) => d >= h.createdDay && habitDayValue(state, h, d) >= (ruleFor(state, h.id, d)?.target ?? 1)).length;
      total += share;
      hit += Math.min(share, done);
    }
    if (v.streak > 0 && (!best || v.streak > best.streak)) best = { name: h.name, streak: v.streak, unit: streakUnit(v.rule.cadence) };
  }
  const pct = total > 0 ? Math.round((hit / total) * 100) : 0;
  const streakLine = best ? ` · longest streak: ${best.name} (${best.streak} ${best.unit}${best.streak === 1 ? '' : 's'})` : '';
  return { title: 'Your week', body: total > 0 ? `${hit} of ${total} targets hit (${pct}%)${streakLine}.` : 'Add a habit or two and next week has a story.' };
}

// ── Cycle ──────────────────────────────────────────────────────────────────

const timelineCache = new WeakMap<TrackerState['settings']['cycle'], { today: string; timeline: CycleTimeline }>();

/** Prediction + phases for the current history; memoized per cycle settings object and day. */
export function cycleTimeline(state: TrackerState, calendarToday: string): CycleTimeline {
  const cycle = state.settings.cycle;
  const cached = timelineCache.get(cycle);
  if (cached && cached.today === calendarToday) return cached.timeline;
  const timeline = buildTimeline(cycle.history, cycle, calendarToday);
  timelineCache.set(cycle, { today: calendarToday, timeline });
  return timeline;
}

/** Day a period is expected, for the discreet cycle prompt; undefined when nothing is due. */
export function cycleExpectedDay(state: TrackerState, calendarToday: string): string | undefined {
  const s = state.settings;
  if (!s.cycleEnabled) return undefined;
  if (isPeriodOpen(s.cycle.history)) return undefined;
  const prediction = cycleTimeline(state, calendarToday).prediction;
  if (!prediction) return undefined;
  if (dayDiff(calendarToday, prediction.nextStart) < -2) return undefined;
  return prediction.nextStart;
}

/** Enabled cycle reminders and the day each fires next (empty when tracking is off). */
export function cycleReminderFires(state: TrackerState, calendarToday: string): ReminderFire[] {
  const s = state.settings;
  if (!s.cycleEnabled) return [];
  return upcomingReminders(s.cycle.reminders, cycleTimeline(state, calendarToday).prediction, calendarToday, { birthControl: s.cycle.birthControl });
}

/** Completed cycles (a start followed by another), oldest first, excluded ones left out. */
export function completedCycles(state: TrackerState): CompletedCycle[] {
  return cycleLengths(state.settings.cycle.history)
    .filter((c) => !c.excluded)
    .map((c) => ({ start: c.start, nextStart: c.nextStart }));
}

/** Per-cycle adherence (share of days met) for every active, non-water habit. */
export function habitsPerCycle(state: TrackerState, cycles: readonly CompletedCycle[]): HabitPerCycle[] {
  const out: HabitPerCycle[] = [];
  for (const habit of activeHabits(state)) {
    if (habit.presetId === 'water') continue;
    const perCycle = cycles.map((c) => {
      const days: string[] = [];
      for (let d = c.start; d < c.nextStart; d = addDays(d, 1)) if (d >= habit.createdDay) days.push(d);
      if (days.length === 0) return NaN;
      const ratios = habitRatios(state, habit, days);
      return ratios.filter((r) => r.ratio >= 1).length / ratios.length;
    });
    if (perCycle.every((v) => Number.isNaN(v))) continue;
    out.push({ habitId: habit.id, name: habit.name, perCycle });
  }
  return out;
}

export interface CycleInsights {
  patterns: SymptomPattern[];
  correlations: Correlation[];
  /** Completed cycles that have at least one day log. */
  loggedCycles: number;
}

const NO_INSIGHTS: CycleInsights = { patterns: [], correlations: [], loggedCycles: 0 };
// Keyed by the slices the insights read, not by the state: a water tap or a settings change leaves
// them untouched, and the correlations (a pass over every habit's history per cycle) are not redone.
let insightsMemo: { deps: unknown[]; result: CycleInsights } | null = null;

export function cycleInsights(state: TrackerState): CycleInsights {
  if (state.cycleLogs.length === 0) return NO_INSIGHTS;
  // The week start is read too: the per-cycle adherence behind the correlations counts weekly
  // periods from it, so a Sunday-first week can change which days a weekly habit was behind on.
  const deps = [state.cycleLogs, state.settings.cycle.history, state.habits, state.rules, state.entries, state.snacks, state.mind, weekStartIndex(state.settings.weekStart)];
  if (insightsMemo && insightsMemo.deps.every((d, i) => d === deps[i])) return insightsMemo.result;
  const cycles = completedCycles(state);
  const patterns = symptomPatterns(state.cycleLogs, cycles);
  const correlations = habitSymptomCorrelations(state.cycleLogs, cycles, habitsPerCycle(state, cycles)).slice(0, 3);
  const loggedDays = new Set(state.cycleLogs.map((l) => l.day));
  const logged = cycles.filter((c) => {
    for (let d = c.start; d < c.nextStart; d = addDays(d, 1)) if (loggedDays.has(d)) return true;
    return false;
  }).length;
  const result = { patterns, correlations, loggedCycles: logged };
  insightsMemo = { deps, result };
  return result;
}

export function planInputFor(state: TrackerState, today: string, nowMs: number, zone: string): PlanInput {
  const s = state.settings;
  const habits: PlanHabit[] = [];
  for (const h of activeHabits(state)) {
    if (h.presetId === 'water') continue;
    const ph = planHabitOf(state, habitView(state, h, today), today);
    if (ph) habits.push(ph);
  }
  const water = waterHabit(state);
  const waterPolicy = water ? policyFor(state, water.id) : undefined;
  const todaySnacks = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD');
  const input: PlanInput = {
    nowMs,
    zone,
    today,
    boundaryHour: s.dayBoundaryHour,
    settings: {
      activeStartMin: s.activeStartMin,
      activeEndMin: s.activeEndMin,
      dailyNudgeCap: s.dailyNudgeCap,
      nudgeIntervalMin: s.nudgeIntervalMin,
      remindersEnabled: s.remindersEnabled,
      offUntil: s.offUntil,
      weeklySummary: s.weeklySummary,
      waterGoalMl: s.waterGoalMl,
      tapSizeMl: s.tapSizeMl,
      units: s.units,
    },
    habits,
    eventHabitIds: [...activeHabits(state).map((h) => h.id), SHIELD_EVENT_HABIT_ID],
    rotationCompletedToday: todaySnacks.length,
    swapOffset: state.nudgeSwap?.day === today ? state.nudgeSwap.offset : 0,
    events: state.events,
    nudgeEvents: state.nudgeEvents,
    weekSummary: weekSummaryText(state, today),
  };
  if (water && waterPolicy?.enabled) {
    const todayWater = state.water.filter((w) => w.day === today);
    const lastTapMs = todayWater.reduce<number | undefined>((acc, w) => (acc === undefined || w.at > acc ? w.at : acc), undefined);
    input.water = {
      habitId: water.id,
      loggedMl: todayWater.reduce((sum, w) => sum + w.ml, 0),
      intervalMin: waterPolicy.intervalMin ?? 90,
      ...(lastTapMs !== undefined ? { lastTapMs } : {}),
    };
  }
  if (state.nudgeSnoozedUntil && state.nudgeSnoozedUntil > nowMs) input.snoozedUntilMs = state.nudgeSnoozedUntil;
  const calendarToday = calendarTodayOf(nowMs, zone);
  const expected = cycleExpectedDay(state, calendarToday);
  if (expected) input.cycleExpectedDay = expected;
  // Only confirmed fires reach the scheduler: a day counted from a period that is not logged yet
  // is shown on the Cycle tab, never submitted to the OS.
  const fires = cycleReminderFires(state, calendarToday).filter((f) => f.confirmed);
  if (fires.length > 0) input.cycleReminders = fires.map((f) => ({ id: f.reminder.id, day: f.day, minute: f.minute, label: f.reminder.label }));
  if (s.cycle.discreet) input.cycleDiscreet = true;
  return input;
}

function calendarTodayOf(nowMs: number, zone: string): string {
  return calendarDayOf(nowMs, zone);
}

const planCache = new WeakMap<TrackerState, { key: string; plan: ScheduledNudge[] }>();
// The last plan built, with the slices it read: a state that differs only in what the planner never
// reads (a Health Connect result, a theme change) reuses it instead of re-planning on the render thread.
let lastPlan: { key: string; deps: readonly unknown[]; plan: ScheduledNudge[] } | null = null;

/** Every part of the state `planInputFor` reads (body, backup and lock settings are not among them). */
function planDeps(state: TrackerState): readonly unknown[] {
  return [state.settings, state.habits, state.rules, state.policies, state.entries, state.water, state.snacks, state.mind, state.events, state.nudgeEvents, state.nudgeSwap, state.nudgeSnoozedUntil, state.cycleLogs];
}

/**
 * Everything that should be scheduled right now; memoized per state, instant, tracking day and zone.
 * The instant, not the minute: the screens all read one clock tick, so they share a plan anyway, and
 * the sync passes its own exact time — a plan cached for an earlier second would place the first
 * slot inside the minimum lead and the OS would be asked for a time already past.
 */
export function nudgePlan(state: TrackerState, today: string, nowMs: number, zone: string): ScheduledNudge[] {
  const key = `${nowMs}|${today}|${zone}`;
  const cached = planCache.get(state);
  if (cached && cached.key === key) return cached.plan;
  const deps = planDeps(state);
  let plan: ScheduledNudge[];
  if (lastPlan && lastPlan.key === key && sameList(lastPlan.deps, deps)) plan = lastPlan.plan;
  else {
    plan = planNudges(planInputFor(state, today, nowMs, zone));
    lastPlan = { key, deps, plan };
  }
  planCache.set(state, { key, plan });
  return plan;
}
