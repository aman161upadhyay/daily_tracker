/**
 * Pure derived data over TrackerState. No React here; hooks in
 * TrackerProvider wrap these with memoization.
 */
import { adherenceStage, type AdherenceStage } from '@/src/domain/adherence/adherenceScale';
import {
  adherenceOf,
  percentChange,
  ratioOf,
  sumValues,
  type DayRatio,
} from '@/src/domain/habits/progress';
import { evaluateStreak, periodRequired, periodStartOf, type PeriodResult } from '@/src/domain/habits/streaks';
import type { Cadence, Category, Habit, HabitRule, MovementSnack, NudgePolicy, SnackType } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import { habitSymptomCorrelations, symptomPatterns, type CompletedCycle, type Correlation, type HabitPerCycle, type SymptomPattern } from '@/src/domain/cycle/insights';
import { upcomingReminders, type ReminderFire } from '@/src/domain/cycle/reminders';
import { buildTimeline, cycleLengths, isPeriodOpen, type CycleTimeline } from '@/src/domain/cycle/timeline';
import { nextNudge, type NextNudge, type RotationItem } from '@/src/domain/nudges/nextNudge';
import { planNudges, type PlanHabit, type PlanInput, type ScheduledNudge } from '@/src/domain/nudges/planner';
import { addDays, calendarDayOf, dayDiff, lastNDays, minutesOfDay } from '@/src/domain/time/trackingDay';
import { waterStatus, type WaterStatus } from '@/src/domain/water/pace';
import type { TrackerState } from './types';

// ── Rules & policies ───────────────────────────────────────────────────────

// Per-state caches. State objects are immutable, so a WeakMap keyed by the
// state gives each render pass O(1) lookups after one O(n) index build.
const rulesCache = new WeakMap<TrackerState, Map<string, HabitRule[]>>();
const valuesCache = new WeakMap<TrackerState, Map<string, Map<string, number>>>();

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

export function snackCountsFor(habit: Habit, snack: MovementSnack): boolean {
  if (!habit.snackType) return false;
  if (isSugarShield(habit)) return snack.trigger === 'SUGAR_SHIELD';
  return snack.type === habit.snackType && snack.trigger !== 'SUGAR_SHIELD';
}

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
  return m;
}

/** Raw value of a habit on a day, derived from whichever log it lives in. */
export function habitDayValue(state: TrackerState, habit: Habit, day: string): number {
  return dayValues(state, habit).get(day) ?? 0;
}

/** Days met so far in the period (week or month) that `day` belongs to, counted from the period's first day up to `day`. */
export function periodDoneOn(state: TrackerState, habit: Habit, cadence: Cadence, day: string): number {
  let done = 0;
  for (let d = periodStartOf(cadence, day); d <= day; d = addDays(d, 1)) {
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
  for (const day of days) {
    const rule = ruleFor(state, habit.id, day);
    const target = rule?.target ?? 1;
    const value = habitDayValue(state, habit, day);
    if (rule && rule.cadence !== 'DAILY') {
      out.push({ day, value, target, ratio: ratioOf(periodDoneOn(state, habit, rule.cadence, day), periodRequired(rule, day, habit.createdDay)) });
    } else {
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
  todayRatio: number;
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

export function habitView(state: TrackerState, habit: Habit, today: string): HabitView {
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
  const periodDone = weekly ? periodDoneOn(state, habit, rule.cadence, today) : undefined;
  const quota = weekly ? periodRequired(rule, today, habit.createdDay) : undefined;
  const periodLabel = rule.cadence === 'WEEKLY' ? 'this week' : rule.cadence === 'MONTHLY' ? 'this month' : undefined;
  const adherence = adherenceOf(ratios14, habit.createdDay, today);
  const streaks = evaluateStreak({
    rules: rulesFor(state, habit.id),
    valueOf: (day) => habitDayValue(state, habit, day),
    createdDay: habit.createdDay,
    today,
  });
  return {
    habit,
    rule,
    policy: policyFor(state, habit.id),
    todayValue: todayRatio.value,
    target: rule.target,
    todayRatio: weekly ? todayRatio.ratio : ratioOf(todayRatio.value, rule.target),
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
  rings: { hydration: number; movement: number; mind: number };
}

export function todaySummary(state: TrackerState, today: string, nowMs: number, zone: string): TodaySummary {
  const s = state.settings;
  const nowMin = minutesOfDay(nowMs, zone);
  const loggedMl = state.water.reduce((acc, w) => (w.day === today ? acc + w.ml : acc), 0);
  const water = waterStatus(loggedMl, s.waterGoalMl, nowMin, s.activeStartMin, s.activeEndMin, s.tapSizeMl);

  const movementHabits = activeHabits(state).filter((h) => h.snackType && !isSugarShield(h));
  let snacksTarget = 0;
  for (const h of movementHabits) {
    const rule = ruleFor(state, h.id, today);
    if (!rule) continue;
    snacksTarget += rule.cadence === 'DAILY' ? rule.target : Math.ceil(rule.timesPerPeriod / 7);
  }
  const snacksDone = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD').length;

  const mindHabits = activeHabits(state).filter((h) => h.mindKind);
  const mindTarget = mindHabits.reduce((acc, h) => acc + (ruleFor(state, h.id, today)?.target ?? 0), 0);
  const mindMinutes = state.mind.reduce((acc, m) => (m.day === today ? acc + m.minutes : acc), 0);

  return {
    water,
    snacksDone,
    snacksTarget,
    mindMinutes,
    mindTarget,
    rings: {
      hydration: ratioOf(loggedMl, s.waterGoalMl),
      movement: ratioOf(snacksDone, snacksTarget),
      mind: ratioOf(mindMinutes, mindTarget),
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

export function liveNudge(state: TrackerState, today: string, nowMs: number, zone: string): NextNudge | null {
  const s = state.settings;
  const nowMin = minutesOfDay(nowMs, zone);
  const items = rotationItems(state);
  const todaySnacks = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD');
  const last = todaySnacks.reduce<MovementSnack | null>((acc, x) => (!acc || x.at > acc.at ? x : acc), null);
  const lastDoneMin = last ? minutesOfDay(last.at, zone) : undefined;
  const snoozedUntilMin =
    state.nudgeSnoozedUntil && state.nudgeSnoozedUntil > nowMs ? minutesOfDay(state.nudgeSnoozedUntil, zone) : undefined;
  const swap = state.nudgeSwap?.day === today ? state.nudgeSwap.offset : 0;
  const legacy = nextNudge(
    { nowMin, activeStartMin: s.activeStartMin, activeEndMin: s.activeEndMin, intervalMin: s.nudgeIntervalMin, lastDoneMin, snoozedUntilMin },
    items,
    todaySnacks.length + swap,
  );
  if (!legacy || !s.remindersEnabled) return legacy;
  // Agree with the first pending movement notification (snoozes and swaps made from a notification
  // are only known to the planner); an overdue slot still shows as "due now" on the card.
  const planned = nudgePlan(state, today, nowMs, zone).find((n) => n.day === today && (n.kind === 'ROTATION' || n.kind === 'WATER') && n.habitIds.some((id) => items.some((i) => i.habitId === id)));
  const item = planned && items.find((i) => planned.habitIds.includes(i.habitId));
  if (!planned || !item) return legacy;
  if (legacy.inMin === 0) return { ...legacy, item };
  const dueMin = minutesOfDay(planned.at, zone);
  return { dueMin, inMin: Math.max(0, dueMin - nowMin), item };
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
  const ratios = habitRatios(state, habit, lastNDays(today, 26 * 7));
  const out: Record<string, number> = {};
  for (const r of ratios) if (r.day >= habit.createdDay) out[r.day] = r.ratio;
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

export function highlights(state: TrackerState, today: string): Highlight[] {
  const out: Highlight[] = [];
  const habits = activeHabits(state);
  const views = habits.map((h) => habitView(state, h, today));

  // Best current streak.
  const streaky = [...views].filter((v) => v.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
  if (streaky) {
    out.push({
      id: 'streak',
      title: `${streaky.habit.name}: ${streaky.streak}-day streak`,
      body: streaky.streak >= streaky.best ? 'That is your best run so far.' : `Best so far: ${streaky.best} days.`,
      category: streaky.habit.category,
      series: streaky.ratios14.slice(-7).map((r) => r.ratio),
      habitId: streaky.habit.id,
    });
  }

  // Water: days logged this week and week-over-week change.
  const water = waterHabit(state);
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
    const trend = change === null ? '' : change >= 0 ? ` Up ${change}% on last week.` : ` Down ${Math.abs(change)}% on last week.`;
    out.push({
      id: 'water-week',
      title: `You logged water ${daysLogged} of the last 7 days`,
      body: `${Math.round(cur.reduce((a, b) => a + b, 0) / 7)} ml a day on average.${trend}`,
      category: 'hydration',
      series: cur,
      habitId: water.id,
    });
  }

  // Habit with the biggest adherence climb over the last week.
  const climber = views
    .map((v) => {
      const first = v.ratios14.slice(0, 7);
      const last = v.ratios14.slice(7);
      const a = first.length ? first.reduce((x, r) => x + r.ratio, 0) / first.length : 0;
      const b = last.length ? last.reduce((x, r) => x + r.ratio, 0) / last.length : 0;
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
    const change = percentChange(snacksLastWeek, snacksThisWeek);
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
  const donePeriod = rule.cadence !== 'DAILY' && (view.periodDone ?? 0) >= periodRequired(rule, today, habit.createdDay);
  return compactPlanHabit({
    id: habit.id,
    name: habit.name,
    policy,
    snackType: habit.snackType,
    doneToday: view.todayRatio >= 1,
    donePeriod,
    todayRatio: view.todayRatio,
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
  let best: { name: string; streak: number } | null = null;
  for (const h of habits) {
    const ratios = habitRatios(state, h, days).filter((r) => r.day >= h.createdDay);
    total += ratios.length;
    hit += ratios.filter((r) => r.ratio >= 1).length;
    const v = habitView(state, h, today);
    if (v.streak > 0 && (!best || v.streak > best.streak)) best = { name: h.name, streak: v.streak };
  }
  const pct = total > 0 ? Math.round((hit / total) * 100) : 0;
  const streakLine = best ? ` · longest streak: ${best.name} (${best.streak})` : '';
  return { title: 'Your week', body: total > 0 ? `${hit} of ${total} daily targets hit (${pct}%)${streakLine}.` : 'Add a habit or two and next week has a story.' };
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
  return upcomingReminders(s.cycle.reminders, cycleTimeline(state, calendarToday).prediction, calendarToday);
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

const insightsCache = new WeakMap<TrackerState, CycleInsights>();

export function cycleInsights(state: TrackerState): CycleInsights {
  const cached = insightsCache.get(state);
  if (cached) return cached;
  const cycles = completedCycles(state);
  const patterns = symptomPatterns(state.cycleLogs, cycles);
  const correlations = habitSymptomCorrelations(state.cycleLogs, cycles, habitsPerCycle(state, cycles)).slice(0, 3);
  const loggedDays = new Set(state.cycleLogs.map((l) => l.day));
  const logged = cycles.filter((c) => {
    for (let d = c.start; d < c.nextStart; d = addDays(d, 1)) if (loggedDays.has(d)) return true;
    return false;
  }).length;
  const result = { patterns, correlations, loggedCycles: logged };
  insightsCache.set(state, result);
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
    },
    habits,
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
  const fires = cycleReminderFires(state, calendarToday);
  if (fires.length > 0) input.cycleReminders = fires.map((f) => ({ id: f.reminder.id, day: f.day, minute: f.minute, label: f.reminder.label }));
  if (s.cycle.discreet) input.cycleDiscreet = true;
  return input;
}

function calendarTodayOf(nowMs: number, zone: string): string {
  return calendarDayOf(nowMs, zone);
}

const planCache = new WeakMap<TrackerState, { minute: number; plan: ScheduledNudge[] }>();

/** Everything that should be scheduled right now; memoized per state and minute. */
export function nudgePlan(state: TrackerState, today: string, nowMs: number, zone: string): ScheduledNudge[] {
  const minute = Math.floor(nowMs / 60_000);
  const cached = planCache.get(state);
  if (cached && cached.minute === minute) return cached.plan;
  const plan = planNudges(planInputFor(state, today, nowMs, zone));
  planCache.set(state, { minute, plan });
  return plan;
}
