/**
 * Irregular-cycle notes, worded neutrally (ported from Cadence's CycleAlerts).
 * Thresholds: a cycle shorter than 21 or longer than 35 days, lengths that
 * vary by more than 7 days, a period longer than 8 days, and outliers more
 * than 7 days from the median (offered for exclusion, never excluded silently).
 */
import type { PeriodSpan } from '../models';
import { dayDiff } from '../time/trackingDay';
import { cycleLengths, normalizeHistory, spread, type CycleLength } from './timeline';

export const SHORT_CYCLE_DAYS = 21;
export const LONG_CYCLE_DAYS = 35;
export const VARIABLE_SPREAD_DAYS = 7;
export const LONG_PERIOD_DAYS = 8;
export const OUTLIER_DISTANCE_DAYS = 7;

export type CycleAlertKind = 'short-cycle' | 'long-cycle' | 'variable' | 'long-period' | 'future-start';

export interface CycleAlert {
  kind: CycleAlertKind;
  title: string;
  body: string;
}

export interface OutlierSuggestion {
  /** Start of the cycle that looks unusual. */
  start: string;
  length: number;
  median: number;
}

export const NOT_CONTRACEPTION = 'Predictions describe past patterns. They are not a contraceptive method and not medical advice.';

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Alerts about the most recent completed cycles and the latest closed period. With `today`, a
 * period logged on a day that has not come yet is called out: predictions ignore it, and it is
 * almost always a slip (an import, a phone whose clock was wrong).
 */
export function cycleAlerts(history: readonly PeriodSpan[], today?: string): CycleAlert[] {
  const h = normalizeHistory(history);
  const cycles = cycleLengths(h).filter((c) => !c.excluded);
  const out: CycleAlert[] = [];
  const future = today ? h.filter((span) => span.start > today) : [];
  if (future.length > 0) {
    out.push({
      kind: 'future-start',
      title: 'A period logged in the future',
      body: `A period is logged as starting on ${future[0]!.start}${future.length > 1 ? ` (and ${future.length - 1} more after it)` : ''}, a day that has not come yet. Predictions leave it out; open that day on the calendar to remove or move it.`,
    });
  }
  const latest = cycles[cycles.length - 1];
  if (latest) {
    if (latest.length < SHORT_CYCLE_DAYS) {
      out.push({
        kind: 'short-cycle',
        title: 'A shorter cycle',
        body: `Your last cycle was ${latest.length} days. Most cycles fall between ${SHORT_CYCLE_DAYS} and ${LONG_CYCLE_DAYS} days, and single short cycles are common. If it keeps happening, it is worth mentioning at your next check-up.`,
      });
    } else if (latest.length > LONG_CYCLE_DAYS) {
      out.push({
        kind: 'long-cycle',
        title: 'A longer cycle',
        body: `Your last cycle was ${latest.length} days. Most cycles fall between ${SHORT_CYCLE_DAYS} and ${LONG_CYCLE_DAYS} days; stress, travel and illness often stretch one. If it keeps happening, it is worth mentioning at your next check-up.`,
      });
    }
  }
  const usable = cycles.filter((c) => c.usable).map((c) => c.length).slice(-6);
  if (usable.length >= 3 && spread(usable) > VARIABLE_SPREAD_DAYS) {
    out.push({
      kind: 'variable',
      title: 'Cycle lengths vary',
      body: `Your last ${usable.length} cycles ranged from ${Math.min(...usable)} to ${Math.max(...usable)} days, so predictions carry a wider range. Logging a few more cycles helps; so does excluding a one-off below.`,
    });
  }
  const lastClosed = [...h].reverse().find((p) => p.end);
  if (lastClosed && lastClosed.end && dayDiff(lastClosed.start, lastClosed.end) + 1 > LONG_PERIOD_DAYS) {
    out.push({
      kind: 'long-period',
      title: 'A longer period',
      body: `The period that started ${lastClosed.start} lasted ${dayDiff(lastClosed.start, lastClosed.end) + 1} days. Periods longer than ${LONG_PERIOD_DAYS} days are worth a conversation with a clinician if they repeat.`,
    });
  }
  return out;
}

/** Cycles that sit far from the rest and are not yet excluded. */
export function outlierSuggestions(history: readonly PeriodSpan[]): OutlierSuggestion[] {
  const cycles = cycleLengths(history);
  const considered = cycles.filter((c) => !c.excluded);
  if (considered.length < 3) return [];
  const med = median(considered.map((c) => c.length));
  const isOutlier = (c: CycleLength) => c.length < SHORT_CYCLE_DAYS || c.length > LONG_CYCLE_DAYS || Math.abs(c.length - med) > OUTLIER_DISTANCE_DAYS;
  return considered.filter(isOutlier).map((c) => ({ start: c.start, length: c.length, median: med }));
}
