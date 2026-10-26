/**
 * Progress, adherence and streak math over per-day values.
 *
 * Streaks are recomputed from raw entries every time; nothing here is stored.
 * (The full Cadence streak engine with freezes lands in M1; this is the
 * forgiving-but-simple version the M0 UI needs.)
 */
import { clamp01 } from '../adherence/adherenceScale';
import { dayDiff } from '../time/trackingDay';

export interface DayRatio {
  day: string;
  value: number;
  target: number;
  /** value / target clamped to [0, 1]. */
  ratio: number;
}

export const ADHERENCE_WINDOW_DAYS = 14;

export function ratioOf(value: number, target: number): number {
  if (target <= 0) return value > 0 ? 1 : 0;
  return clamp01(value / target);
}

/** Whether a day's own value met the day's target (a day with no target counts when something was logged). */
export function dayMet(r: Pick<DayRatio, 'value' | 'target'>): boolean {
  return r.target > 0 ? r.value >= r.target : r.value > 0;
}

/**
 * How many of these days met their own target. For a weekly or monthly habit `ratio` carries the
 * period's accumulated progress (one Monday session reads 1.0 all week), so the count asks each
 * day about itself: that habit shows one day met, not seven.
 */
export function daysMet(ratios: readonly DayRatio[]): number {
  return ratios.filter(dayMet).length;
}

/**
 * Adherence = completion rate over the trailing 14 tracking days, with
 * today's partial progress counted proportionally. Habits younger than three
 * days use today's progress only.
 *
 * `ratiosAsc` must be ordered oldest → today and end with today.
 */
export function adherenceOf(ratiosAsc: DayRatio[], createdDay: string, today: string): number {
  if (ratiosAsc.length === 0) return 0;
  const todayRatio = ratiosAsc[ratiosAsc.length - 1]!.ratio;
  const historyDays = dayDiff(createdDay, today) + 1;
  if (historyDays < 3) return todayRatio;

  const window = ratiosAsc
    .filter((r) => r.day >= createdDay)
    .slice(-ADHERENCE_WINDOW_DAYS);
  if (window.length === 0) return todayRatio;
  const sum = window.reduce((acc, r) => acc + r.ratio, 0);
  return clamp01(sum / window.length);
}

/** Consecutive completed days ending today (or yesterday, if today is still open). */
export function currentStreak(ratiosAsc: DayRatio[]): number {
  let i = ratiosAsc.length - 1;
  if (i < 0) return 0;
  let streak = 0;
  if (ratiosAsc[i]!.ratio >= 1) {
    streak++;
  }
  i--;
  while (i >= 0 && ratiosAsc[i]!.ratio >= 1) {
    streak++;
    i--;
  }
  return streak;
}

export function bestStreak(ratiosAsc: DayRatio[]): number {
  let best = 0;
  let run = 0;
  for (const r of ratiosAsc) {
    if (r.ratio >= 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** Percentage change between two totals; null when the baseline is zero. */
export function percentChange(previous: number, current: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
