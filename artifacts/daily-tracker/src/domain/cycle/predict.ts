/**
 * Minimal cycle math for the opt-in Cycle tab (M0). The full predictor with
 * symptom windows and discreet reminders is ported in M5.
 */
import type { PeriodSpan } from '../models';
import { addDays, dayDiff } from '../time/trackingDay';

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export const PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Period',
  follicular: 'Follicular',
  ovulation: 'Ovulation window',
  luteal: 'Luteal',
};

export function lastPeriodStart(history: PeriodSpan[]): string | null {
  if (history.length === 0) return null;
  return history.reduce((latest, p) => (p.start > latest ? p.start : latest), history[0]!.start);
}

export function isPeriodOpen(history: PeriodSpan[]): boolean {
  const start = lastPeriodStart(history);
  if (!start) return false;
  const span = history.find((p) => p.start === start);
  return !!span && !span.end;
}

/** Cycles needed before the user's own history fully replaces the typical length. */
export const CYCLES_TO_TRUST = 3;

/**
 * Average length of the completed cycles. Until `CYCLES_TO_TRUST` cycles are
 * logged, the typical length (`fallbackDays`) is blended in as the missing
 * samples, so a single odd cycle cannot swing the prediction.
 */
export function averageCycleLength(history: PeriodSpan[], fallbackDays: number): number {
  const starts = history.map((p) => p.start).sort();
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = dayDiff(starts[i - 1]!, starts[i]!);
    if (gap >= 15 && gap <= 60) gaps.push(gap);
  }
  if (gaps.length === 0) return fallbackDays;
  const fallbackWeight = Math.max(0, CYCLES_TO_TRUST - gaps.length);
  const total = gaps.reduce((a, b) => a + b, 0) + fallbackDays * fallbackWeight;
  return Math.round(total / (gaps.length + fallbackWeight));
}

/** 1-based day of the current cycle. */
export function cycleDay(today: string, lastStart: string): number {
  return dayDiff(lastStart, today) + 1;
}

export function predictedNextStart(lastStart: string, cycleLength: number): string {
  return addDays(lastStart, cycleLength);
}

export function phaseOf(day: number, cycleLength: number, periodDays: number): CyclePhase {
  if (day <= periodDays) return 'menstrual';
  const ovulationDay = cycleLength - 14;
  if (day >= ovulationDay - 2 && day <= ovulationDay + 1) return 'ovulation';
  if (day < ovulationDay - 2) return 'follicular';
  return 'luteal';
}
