/**
 * Streaks with freezes, recomputed from raw per-day values every time
 * (nothing here is ever stored). Ported from Cadence's StreakEngine:
 *
 * - The engine walks periods: a day, a Mon–Sun week, or a calendar month,
 *   according to the rule in effect when the period starts.
 * - A period is met when enough days reach the per-day target (DAILY: the
 *   day itself; WEEKLY/MONTHLY: `timesPerPeriod` days, prorated for partial
 *   periods and excluded "off" days).
 * - A met period grows the streak by one. The open period (the one that
 *   contains today) is never penalised.
 * - A closed, unmet period spends a freeze if the month the period *ends* in
 *   still has allowance (status FROZEN, streak kept). With no allowance left
 *   the status is MISSED and the streak resets. No freeze is spent when there
 *   is no streak to protect.
 * - Rules are versioned: a rule applies to a period when it took effect on or
 *   before the period's last day, so edits never re-score closed periods.
 * - Recomputing is idempotent, so backfilling a missed day refunds its freeze.
 */
import type { Cadence, HabitRule } from '../models';

/**
 * Freezes a new habit starts with, by cadence: a daily habit gets two slips a month, a weekly one,
 * a monthly none (its period is the month). The editor lets each habit move 0–5 from there.
 */
export function defaultFreezes(cadence: Cadence): number {
  return cadence === 'DAILY' ? 2 : cadence === 'WEEKLY' ? 1 : 0;
}
import { addDays, dayDiff, parseDay, toDayString, weekStartOf } from '../time/trackingDay';

export type PeriodStatus = 'MET' | 'OPEN' | 'FROZEN' | 'MISSED' | 'SKIPPED';

export interface PeriodResult {
  /** First and last day of the period (inclusive, clamped to the habit's life). */
  start: string;
  end: string;
  cadence: Cadence;
  status: PeriodStatus;
  /** Days that reached the per-day target. */
  done: number;
  /** Days required for the period to count (prorated). */
  required: number;
  streakAfter: number;
  /** "YYYY-MM" of the freeze spent, when status is FROZEN. */
  freezeMonth?: string;
}

export interface StreakInput {
  /** Rules of this habit, any order. */
  rules: HabitRule[];
  valueOf: (day: string) => number;
  createdDay: string;
  today: string;
  /** Days excluded from scoring (off mode / travel). */
  offDays?: ReadonlySet<string>;
}

export interface StreakResult {
  streak: number;
  best: number;
  periods: PeriodResult[];
  /** Freezes spent per "YYYY-MM". */
  freezesUsed: Record<string, number>;
  freezesLeftThisMonth: number;
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

function monthStartOf(day: string): string {
  return `${monthOf(day)}-01`;
}

function monthEndOf(day: string): string {
  const { year, month } = parseDay(day);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return toDayString(year, month, last);
}

/** First day of the period (week or month) a day belongs to; the day itself for DAILY. */
export function periodStartOf(cadence: Cadence, day: string): string {
  return periodBounds(cadence, day).start;
}

/** Days per period a rule really asks for: `timesPerPeriod`, capped at the length of the period `day` is in. */
export function periodQuota(rule: Pick<HabitRule, 'cadence' | 'timesPerPeriod'>, day: string): number {
  if (rule.cadence === 'DAILY') return 1;
  return Math.max(1, Math.min(rule.timesPerPeriod, periodBounds(rule.cadence, day).length));
}

/**
 * Days the period containing `day` really requires of this habit: the quota, prorated to the days
 * the habit has in the period (from `from` on, days off excluded) and never more than those days.
 * `from` is the first day of the habit's current cadence segment (`segmentStartOn`): the day it was
 * created, or the day a new cadence took over. One formula for the streak, the Today card
 * ("2 of 4 this week"), the charts, the widget and the planner, so the week a habit was created on
 * a Thursday — or the month a weekly habit became monthly — is judged the same everywhere.
 * 0 when the habit has no day in the period.
 */
export function periodRequired(rule: Pick<HabitRule, 'cadence' | 'timesPerPeriod'>, day: string, from: string, offDays?: ReadonlySet<string>): number {
  if (rule.cadence === 'DAILY') return 1;
  const bounds = periodBounds(rule.cadence, day);
  const first = from > bounds.start ? from : bounds.start;
  if (first > bounds.end) return 0;
  // Arithmetic, not a walk: this runs once per day of every history chart and cycle insight.
  let available = dayDiff(first, bounds.end) + 1;
  if (offDays) for (const d of offDays) if (d >= first && d <= bounds.end) available--;
  if (available <= 0) return 0;
  return Math.min(available, Math.max(1, Math.round((periodQuota(rule, bounds.end) * available) / bounds.length)));
}

/**
 * First day of the cadence segment that contains `day`: the habit's creation day, or the first day
 * after the last period of the previous cadence. Replays the same walk the streak takes, so a
 * weekly habit that became monthly on the 26th starts its monthly segment where the streak does
 * (the day after that week ended), and its first month is prorated from there, not scored against
 * a full month's quota.
 */
export function segmentStartOn(rules: HabitRule[], createdDay: string, day: string): string {
  return segmentStartIn(cadenceSegments(rules, createdDay, day), day, createdDay);
}

export interface CadenceSegment {
  /** First day the cadence applies: creation, or the day after the previous cadence's last period. */
  from: string;
  cadence: Cadence;
}

/**
 * Every cadence segment from creation up to `day`, oldest first: one walk over the periods gives
 * the segment of any day in the range by lookup, where walking again for each day of a year's
 * history would be a year of periods per day.
 */
export function cadenceSegments(rules: HabitRule[], createdDay: string, day: string): CadenceSegment[] {
  const sorted = sortRules(rules);
  if (sorted.length === 0) return [{ from: createdDay, cadence: 'DAILY' }];
  let cadence = ruleOn(sorted, createdDay).cadence;
  const out: CadenceSegment[] = [{ from: createdDay, cadence }];
  // A cadence that never changed has one segment: no need to walk a year of periods.
  if (sorted.every((r) => r.cadence === cadence)) return out;
  let cursor = createdDay;
  while (cursor <= day) {
    const rule = ruleOn(sorted, cursor);
    if (rule.cadence !== cadence) {
      cadence = rule.cadence;
      out.push({ from: cursor, cadence });
    }
    cursor = addDays(periodBounds(rule.cadence, cursor).end, 1);
  }
  return out;
}

/** Start of the segment that contains `day` in a list walked at least up to `day`. */
export function segmentStartIn(segments: readonly CadenceSegment[], day: string, createdDay: string): string {
  if (day <= createdDay) return createdDay;
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i]!.from <= day) return segments[i]!.from;
  return createdDay;
}

export function periodBounds(cadence: Cadence, day: string): { start: string; end: string; length: number } {
  if (cadence === 'DAILY') return { start: day, end: day, length: 1 };
  if (cadence === 'WEEKLY') {
    const start = weekStartOf(day);
    return { start, end: addDays(start, 6), length: 7 };
  }
  const start = monthStartOf(day);
  const end = monthEndOf(day);
  return { start, end, length: dayDiff(start, end) + 1 };
}

function sortRules(rules: HabitRule[]): HabitRule[] {
  return [...rules].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0));
}

/** Latest rule in effect on `day`; days before the first rule use the first rule. */
export function ruleOn(sortedRules: HabitRule[], day: string): HabitRule {
  let chosen = sortedRules[0]!;
  for (const r of sortedRules) {
    if (r.effectiveFrom <= day) chosen = r;
    else break;
  }
  return chosen;
}

export function evaluateStreak(input: StreakInput): StreakResult {
  const rules = sortRules(input.rules);
  const off = input.offDays ?? new Set<string>();
  const empty: StreakResult = { streak: 0, best: 0, periods: [], freezesUsed: {}, freezesLeftThisMonth: 0 };
  if (rules.length === 0 || input.createdDay > input.today) return empty;

  const periods: PeriodResult[] = [];
  const freezesUsed: Record<string, number> = {};
  let streak = 0;
  let best = 0;
  let cursor = input.createdDay;

  while (cursor <= input.today) {
    const startRule = ruleOn(rules, cursor);
    const bounds = periodBounds(startRule.cadence, cursor);
    // The rule that governs the period: the latest one (of the same cadence)
    // that took effect by the period's last day, so a target edited mid-week
    // applies to the current week but never to closed ones.
    const endRule = ruleOn(rules, bounds.end);
    const rule = endRule.cadence === startRule.cadence ? endRule : startRule;

    const start = cursor; // clamped to the habit's life
    const end = bounds.end;
    const isOpen = end >= input.today;

    let available = 0;
    let done = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (off.has(d)) continue;
      available++;
      // Each day is judged against the target in force on that day (the same rule the Today
      // card and the charts use), so "3 of 4 this week" never disagrees with the streak.
      if (d <= input.today && input.valueOf(d) >= ruleOn(rules, d).target) done++;
    }
    // Prorated for the habit's start and days off, and never more than the days the period has (a
    // "31 days a month" rhythm asks for every day of February, not for three days that do not exist).
    const required = periodRequired(rule, end, start, off);

    let status: PeriodStatus;
    let freezeMonth: string | undefined;
    if (available === 0) {
      status = 'SKIPPED';
    } else if (done >= required) {
      status = 'MET';
      streak++;
    } else if (isOpen) {
      status = 'OPEN';
    } else {
      const month = monthOf(end);
      const used = freezesUsed[month] ?? 0;
      if (streak > 0 && used < rule.freezesPerMonth) {
        status = 'FROZEN';
        freezeMonth = month;
        freezesUsed[month] = used + 1;
      } else {
        status = 'MISSED';
        streak = 0;
      }
    }
    if (streak > best) best = streak;
    periods.push({ start, end, cadence: rule.cadence, status, done, required, streakAfter: streak, freezeMonth });
    cursor = addDays(end, 1);
  }

  const todayRule = ruleOn(rules, input.today);
  const thisMonth = monthOf(input.today);
  return {
    streak,
    best,
    periods,
    freezesUsed,
    freezesLeftThisMonth: Math.max(0, todayRule.freezesPerMonth - (freezesUsed[thisMonth] ?? 0)),
  };
}
