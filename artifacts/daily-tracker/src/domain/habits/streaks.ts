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
      if (d <= input.today && input.valueOf(d) >= rule.target) done++;
    }
    const required = rule.cadence === 'DAILY' ? 1 : Math.max(1, Math.round((rule.timesPerPeriod * available) / bounds.length));

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
