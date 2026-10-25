/**
 * Pure derived data over TrackerState. No React here; hooks in
 * TrackerProvider wrap these with memoization.
 */
import { adherenceStage, type AdherenceStage } from '@/src/domain/adherence/adherenceScale';
import {
  adherenceOf,
  bestStreak,
  currentStreak,
  percentChange,
  ratioOf,
  sumValues,
  type DayRatio,
} from '@/src/domain/habits/progress';
import type { Habit, HabitRule, MovementSnack, NudgePolicy, SnackType } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import { nextNudge, type NextNudge, type RotationItem } from '@/src/domain/nudges/nextNudge';
import { addDays, lastNDays, minutesOfDay, weekStartOf } from '@/src/domain/time/trackingDay';
import { waterStatus, type WaterStatus } from '@/src/domain/water/pace';
import type { TrackerState } from './types';

// ── Rules & policies ───────────────────────────────────────────────────────

export function ruleFor(state: TrackerState, habitId: string, day: string): HabitRule | undefined {
  const rules = state.rules.filter((r) => r.habitId === habitId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  if (rules.length === 0) return undefined;
  let chosen = rules[0]!;
  for (const r of rules) if (r.effectiveFrom <= day) chosen = r;
  return chosen;
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

/** Raw value of a habit on a day, derived from whichever log it lives in. */
export function habitDayValue(state: TrackerState, habit: Habit, day: string): number {
  if (habit.presetId === 'water') {
    return state.water.reduce((acc, w) => (w.day === day ? acc + w.ml : acc), 0);
  }
  if (habit.snackType) {
    return state.snacks.reduce((acc, s) => (s.day === day && snackCountsFor(habit, s) ? acc + 1 : acc), 0);
  }
  if (habit.mindKind) {
    return state.mind.reduce((acc, m) => (m.day === day && m.kind === habit.mindKind ? acc + m.minutes : acc), 0);
  }
  const total = state.entries.reduce((acc, e) => (e.day === day && e.habitId === habit.id ? acc + e.value : acc), 0);
  return habit.type === 'YES_NO' ? (total > 0 ? 1 : 0) : total;
}

/** Per-day ratios for a list of days (oldest → newest). Weekly habits use the week-to-date count. */
export function habitRatios(state: TrackerState, habit: Habit, days: string[]): DayRatio[] {
  const out: DayRatio[] = [];
  const weekDone = new Map<string, number>();
  for (const day of days) {
    const rule = ruleFor(state, habit.id, day);
    const target = rule?.target ?? 1;
    const value = habitDayValue(state, habit, day);
    if (rule && rule.cadence !== 'DAILY') {
      const periodKey = weekStartOf(day);
      const prev = weekDone.get(periodKey) ?? 0;
      const doneToday = value >= target ? 1 : 0;
      const done = prev + doneToday;
      weekDone.set(periodKey, done);
      out.push({ day, value, target, ratio: ratioOf(done, rule.timesPerPeriod) });
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
  streak: number;
  best: number;
  /** Last 14 days, oldest first, ending today. */
  ratios14: DayRatio[];
  /** Week-to-date completed days for weekly habits. */
  weekDone?: number;
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
  // Enough history for streaks: 120 days is plenty for the UI and cheap enough.
  const days = lastNDays(today, 120);
  const ratios = habitRatios(state, habit, days);
  const ratios14 = ratios.slice(-14);
  const todayRatio = ratios14[ratios14.length - 1]!;
  const weekly = rule.cadence !== 'DAILY';
  const weekDone = weekly
    ? ratios.filter((r) => weekStartOf(r.day) === weekStartOf(today) && r.value >= r.target).length
    : undefined;
  const adherence = adherenceOf(ratios14, habit.createdDay, today);
  return {
    habit,
    rule,
    policy: policyFor(state, habit.id),
    todayValue: todayRatio.value,
    target: rule.target,
    todayRatio: weekly ? todayRatio.ratio : ratioOf(todayRatio.value, rule.target),
    adherence,
    stage: adherenceStage(adherence),
    streak: currentStreak(ratios),
    best: bestStreak(ratios),
    ratios14,
    weekDone,
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
  const water = waterStatus(loggedMl, s.waterGoalMl, nowMin, s.activeStartMin, s.activeEndMin);

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
  const todaySnacks = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD');
  const last = todaySnacks.reduce<MovementSnack | null>((acc, x) => (!acc || x.at > acc.at ? x : acc), null);
  const lastDoneMin = last ? minutesOfDay(last.at, zone) : undefined;
  const snoozedUntilMin =
    state.nudgeSnoozedUntil && state.nudgeSnoozedUntil > nowMs ? minutesOfDay(state.nudgeSnoozedUntil, zone) : undefined;
  const swap = state.nudgeSwap?.day === today ? state.nudgeSwap.offset : 0;
  return nextNudge(
    { nowMin, activeStartMin: s.activeStartMin, activeEndMin: s.activeEndMin, intervalMin: s.nudgeIntervalMin, lastDoneMin, snoozedUntilMin },
    rotationItems(state),
    todaySnacks.length + swap,
  );
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
  category: 'hydration' | 'movement' | 'mind' | 'fuel' | 'body' | 'cycle';
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
