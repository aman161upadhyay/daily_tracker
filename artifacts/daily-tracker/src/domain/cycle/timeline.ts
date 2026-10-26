/**
 * Cycle prediction and phases, ported from Cadence's CyclePredictor /
 * CycleTimeline. All dates are calendar days (YYYY-MM-DD, local).
 *
 * Rules (see docs/IMPLEMENTATION_PLAN.md §5.7):
 * - next start = last start + mean of the last ≤ 6 usable cycle lengths
 *   (10–90 days, not excluded); until three are logged the typical length
 *   from Settings is blended in as the missing samples;
 * - range ±2 days with fewer than three usable cycles, else ±ceil(SD) capped at 7;
 * - ovulation = next start − luteal length (10–16, default 14); fertile window =
 *   five days before ovulation through ovulation; late-luteal = the last five days;
 * - a short cycle that would put ovulation inside the period clamps it to the
 *   day after the period ends and marks the prediction low-confidence;
 * - a late period keeps today in late-luteal (and suppresses reminders);
 * - `periodContaining()` is the only "is this a period day?" rule.
 */
import type { CycleSettings, PeriodSpan } from '../models';
import { addDays, dayDiff } from '../time/trackingDay';

export const USABLE_MIN_DAYS = 10;
export const USABLE_MAX_DAYS = 90;
export const CYCLES_TO_TRUST = 3;
export const MAX_SAMPLES = 6;
export const RANGE_CAP_DAYS = 7;
export const FERTILE_DAYS_BEFORE_OVULATION = 5;
export const LATE_LUTEAL_DAYS = 5;
/** "Period ended today" stays on offer through day 14 of an open period. */
export const OPEN_PERIOD_MAX_DAYS = 14;
/** A start logged up to this many days before an existing start moves that start. */
export const MOVE_START_WINDOW_DAYS = 7;

export type CyclePhase = 'menstrual' | 'follicular' | 'fertile' | 'luteal' | 'late-luteal';

export const PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Period',
  follicular: 'Follicular',
  fertile: 'Fertile window',
  luteal: 'Luteal',
  'late-luteal': 'Late luteal',
};

export type CycleRules = Pick<CycleSettings, 'avgCycleDays' | 'periodDays' | 'lutealDays'>;

// ── History ────────────────────────────────────────────────────────────────

/** Sorted by start, one span per start day, ends that precede their start dropped. */
export function normalizeHistory(history: readonly PeriodSpan[]): PeriodSpan[] {
  const byStart = new Map<string, PeriodSpan>();
  for (const p of history) {
    if (!p || typeof p.start !== 'string') continue;
    const clean: PeriodSpan = { start: p.start };
    if (p.end && p.end >= p.start) clean.end = p.end;
    if (p.excluded) clean.excluded = true;
    byStart.set(p.start, clean);
  }
  return [...byStart.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
}

export function isPeriodOpen(history: readonly PeriodSpan[]): boolean {
  const h = normalizeHistory(history);
  const last = h[h.length - 1];
  return !!last && !last.end;
}

export interface CycleLength {
  start: string;
  nextStart: string;
  length: number;
  excluded: boolean;
  /** Not excluded and 10–90 days long. */
  usable: boolean;
}

/** One entry per completed cycle (a start followed by another start), oldest first. */
export function cycleLengths(history: readonly PeriodSpan[]): CycleLength[] {
  const h = normalizeHistory(history);
  const out: CycleLength[] = [];
  for (let i = 1; i < h.length; i++) {
    const span = h[i - 1]!;
    const length = dayDiff(span.start, h[i]!.start);
    const excluded = !!span.excluded;
    out.push({ start: span.start, nextStart: h[i]!.start, length, excluded, usable: !excluded && length >= USABLE_MIN_DAYS && length <= USABLE_MAX_DAYS });
  }
  return out;
}

/** The last ≤ 6 usable lengths, oldest first. */
export function usableLengths(history: readonly PeriodSpan[]): number[] {
  return cycleLengths(history)
    .filter((c) => c.usable)
    .map((c) => c.length)
    .slice(-MAX_SAMPLES);
}

/**
 * Mean of the usable lengths. Until `CYCLES_TO_TRUST` are logged, the typical
 * length (`fallbackDays`) stands in for the missing samples, so one odd cycle
 * cannot swing the prediction.
 */
export function averageCycleLength(history: readonly PeriodSpan[], fallbackDays: number): number {
  const lengths = usableLengths(history);
  if (lengths.length === 0) return fallbackDays;
  const fallbackWeight = Math.max(0, CYCLES_TO_TRUST - lengths.length);
  const total = lengths.reduce((a, b) => a + b, 0) + fallbackDays * fallbackWeight;
  return Math.round(total / (lengths.length + fallbackWeight));
}

/** Population standard deviation. */
export function spread(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function rangeDays(lengths: readonly number[]): number {
  if (lengths.length < CYCLES_TO_TRUST) return 2;
  return Math.min(RANGE_CAP_DAYS, Math.ceil(spread(lengths)));
}

/** 1-based day of the cycle that started on `lastStart`. */
export function cycleDay(today: string, lastStart: string): number {
  return dayDiff(lastStart, today) + 1;
}

export function predictedNextStart(lastStart: string, cycleLength: number): string {
  return addDays(lastStart, cycleLength);
}

// ── Prediction ─────────────────────────────────────────────────────────────

export interface CyclePrediction {
  lastStart: string;
  /** Mean length used for the projection. */
  cycleLength: number;
  usableCycles: number;
  nextStart: string;
  earliest: string;
  latest: string;
  rangeDays: number;
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
  lateLutealStart: string;
  /** Ovulation was pushed to the day after the period (short cycle). */
  clamped: boolean;
  lowConfidence: boolean;
  /** Days past the expected start with no period logged (0 = not late). */
  lateDays: number;
}

/** Last day of a period span: its end, or for an open period the typical length clipped to today. */
export function periodEndOf(span: PeriodSpan, rules: Pick<CycleRules, 'periodDays'>, today: string): string {
  if (span.end) return span.end;
  const typical = addDays(span.start, Math.max(1, rules.periodDays) - 1);
  const clipped = typical < today ? typical : today;
  return clipped < span.start ? span.start : clipped;
}

function ovulationFor(nextStart: string, periodEnd: string, rules: CycleRules): { day: string; clamped: boolean } {
  const natural = addDays(nextStart, -rules.lutealDays);
  if (natural <= periodEnd) return { day: addDays(periodEnd, 1), clamped: true };
  return { day: natural, clamped: false };
}

/**
 * The history a prediction may stand on: starts up to today. A start logged on a future day (an
 * import, a clock that was wrong) stays in the record — the calendar shows it so it can be
 * removed — but nothing is counted from it.
 */
export function historyUpTo(history: readonly PeriodSpan[], today: string): PeriodSpan[] {
  return normalizeHistory(history).filter((span) => span.start <= today);
}

export function predictCycle(history: readonly PeriodSpan[], rules: CycleRules, today: string): CyclePrediction | null {
  const h = historyUpTo(history, today);
  const last = h[h.length - 1];
  if (!last) return null;
  const lengths = usableLengths(h);
  const cycleLength = averageCycleLength(h, rules.avgCycleDays);
  const nextStart = predictedNextStart(last.start, cycleLength);
  const range = rangeDays(lengths);
  const periodEnd = periodEndOf(last, rules, today);
  const ov = ovulationFor(nextStart, periodEnd, rules);
  const lateDays = Math.max(0, dayDiff(nextStart, today));
  return {
    lastStart: last.start,
    cycleLength,
    usableCycles: lengths.length,
    nextStart,
    earliest: addDays(nextStart, -range),
    latest: addDays(nextStart, range),
    rangeDays: range,
    ovulation: ov.day,
    fertileStart: addDays(ov.day, -FERTILE_DAYS_BEFORE_OVULATION),
    fertileEnd: ov.day,
    lateLutealStart: addDays(nextStart, -LATE_LUTEAL_DAYS),
    clamped: ov.clamped,
    lowConfidence: ov.clamped || lengths.length < CYCLES_TO_TRUST,
    lateDays,
  };
}

// ── Timeline: the phase of any date ────────────────────────────────────────

/**
 * The word that qualifies a phase label: a day still to come is "predicted", a day that has
 * passed (or today) outside logged bleeding is "estimated" — the phase was calculated, not
 * observed — and a logged period needs no qualifier.
 */
export function phaseQualifier(info: Pick<CycleDayInfo, 'estimated'> | null | undefined, date: string, today: string): '' | 'predicted' | 'estimated' {
  if (!info || !info.estimated) return '';
  return date > today ? 'predicted' : 'estimated';
}

export interface CycleDayInfo {
  phase: CyclePhase;
  /** True when the phase comes from a prediction (the projected cycle) rather than logged starts. */
  predicted: boolean;
  /**
   * True for every phase that is calculated rather than observed: only logged bleeding is known.
   * A past cycle's "fertile" day is counted back from the next logged start — an estimate, even
   * though nothing about it is predicted.
   */
  estimated: boolean;
  /** 1-based day of the (logged or projected) cycle. */
  cycleDay: number;
  /** 1-based day within the period, for period days. */
  periodDay?: number;
  isOvulation: boolean;
  /** The period expected on this day has not arrived (dates between the expected start and today). */
  late: boolean;
}

export interface ProjectedPeriod {
  start: string;
  end: string;
}

export interface CycleTimeline {
  history: PeriodSpan[];
  prediction: CyclePrediction | null;
  /** The logged period that contains `date`, if any. The only period-day rule. */
  periodContaining(date: string): PeriodSpan | undefined;
  /** Phase of any date; null before the first logged period. */
  infoOn(date: string): CycleDayInfo | null;
  /** Predicted periods between two days (inclusive), for calendars and "upcoming". */
  projectedPeriods(fromDay: string, toDay: string): ProjectedPeriod[];
}

interface CycleWindow {
  start: string;
  nextStart: string;
  periodEnd: string;
  predicted: boolean;
}

export function buildTimeline(history: readonly PeriodSpan[], rules: CycleRules, today: string): CycleTimeline {
  // Windows and predictions count from starts up to today; a future-dated start is only ever
  // "a period logged on that day" (periodContaining), never an anchor.
  const all = normalizeHistory(history);
  const h = historyUpTo(all, today);
  const prediction = predictCycle(h, rules, today);
  const periodDays = Math.max(1, rules.periodDays);

  const periodContaining = (date: string): PeriodSpan | undefined => {
    for (let i = all.length - 1; i >= 0; i--) {
      const span = all[i]!;
      if (span.start > date) continue;
      if (date <= periodEndOf(span, rules, today)) return span;
      return undefined;
    }
    return undefined;
  };

  /** Anchor a date to a projected cycle once it is past the expected start. */
  const projectedWindow = (date: string): CycleWindow | null => {
    if (!prediction) return null;
    const length = prediction.cycleLength;
    const anchor = prediction.lateDays > 0 ? addDays(today, 1) : prediction.nextStart;
    if (date < anchor) return null;
    const k = Math.floor(dayDiff(anchor, date) / length);
    const start = addDays(anchor, k * length);
    return { start, nextStart: addDays(start, length), periodEnd: addDays(start, periodDays - 1), predicted: true };
  };

  const windowFor = (date: string): CycleWindow | null => {
    if (h.length === 0 || date < h[0]!.start) return null;
    let idx = -1;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i]!.start <= date) {
        idx = i;
        break;
      }
    }
    const span = h[idx]!;
    const next = h[idx + 1];
    if (next) return { start: span.start, nextStart: next.start, periodEnd: periodEndOf(span, rules, today), predicted: false };
    if (!prediction) return null;
    if (date >= prediction.nextStart) {
      // Expected start has passed: late days stay in late-luteal, the future is projected.
      if (date <= today) return { start: span.start, nextStart: addDays(today, 1), periodEnd: periodEndOf(span, rules, today), predicted: true };
      return projectedWindow(date);
    }
    return { start: span.start, nextStart: prediction.nextStart, periodEnd: periodEndOf(span, rules, today), predicted: true };
  };

  const infoOn = (date: string): CycleDayInfo | null => {
    const logged = periodContaining(date);
    if (logged) {
      return { phase: 'menstrual', predicted: false, estimated: false, cycleDay: dayDiff(logged.start, date) + 1, periodDay: dayDiff(logged.start, date) + 1, isOvulation: false, late: false };
    }
    const w = windowFor(date);
    if (!w) return null;
    const day = dayDiff(w.start, date) + 1;
    const late = !!prediction && prediction.lateDays > 0 && w.start === prediction.lastStart && date >= prediction.nextStart && date <= today;
    if (w.predicted && w.start !== prediction?.lastStart && date >= w.start && date <= w.periodEnd) {
      return { phase: 'menstrual', predicted: true, estimated: true, cycleDay: day, periodDay: day, isOvulation: false, late: false };
    }
    if (late) return { phase: 'late-luteal', predicted: true, estimated: true, cycleDay: day, isOvulation: false, late: true };
    const ov = ovulationFor(w.nextStart, w.periodEnd, rules);
    const fertileStart = addDays(ov.day, -FERTILE_DAYS_BEFORE_OVULATION);
    const lateLutealStart = addDays(w.nextStart, -LATE_LUTEAL_DAYS);
    let phase: CyclePhase;
    if (date >= lateLutealStart && date > ov.day) phase = 'late-luteal';
    else if (date >= fertileStart && date <= ov.day) phase = 'fertile';
    else if (date > ov.day) phase = 'luteal';
    else phase = 'follicular';
    return { phase, predicted: w.predicted || date > today, estimated: true, cycleDay: day, isOvulation: date === ov.day, late: false };
  };

  const projectedPeriods = (fromDay: string, toDay: string): ProjectedPeriod[] => {
    if (!prediction) return [];
    const out: ProjectedPeriod[] = [];
    const length = prediction.cycleLength;
    const anchor = prediction.lateDays > 0 ? addDays(today, 1) : prediction.nextStart;
    for (let k = 0; k < 400; k++) {
      const start = addDays(anchor, k * length);
      if (start > toDay) break;
      const end = addDays(start, periodDays - 1);
      if (end < fromDay) continue;
      out.push({ start, end });
    }
    return out;
  };

  return { history: all, prediction, periodContaining, infoOn, projectedPeriods };
}

/** Birth-control mode hides the fertile window: those days read as follicular. */
export function displayPhase(phase: CyclePhase, birthControl: boolean): CyclePhase {
  return birthControl && phase === 'fertile' ? 'follicular' : phase;
}

// ── Buttons: what to offer today ───────────────────────────────────────────

export type TodayOffer =
  | { kind: 'end'; prominent: boolean; start: string }
  | { kind: 'ended-today'; start: string }
  | { kind: 'start' };

/**
 * "Period ended today" is offered prominently while the open period is within
 * its usual length, subtly through day 14, and not at all after that (the
 * period is then treated as over at its usual length).
 */
export function todayOffer(history: readonly PeriodSpan[], rules: Pick<CycleRules, 'periodDays'>, today: string): TodayOffer {
  const h = normalizeHistory(history);
  const last = h[h.length - 1];
  if (!last) return { kind: 'start' };
  if (last.end) return last.end === today ? { kind: 'ended-today', start: last.start } : { kind: 'start' };
  const d = dayDiff(last.start, today);
  if (d < 0) return { kind: 'start' };
  if (d <= rules.periodDays - 1) return { kind: 'end', prominent: true, start: last.start };
  if (d <= OPEN_PERIOD_MAX_DAYS - 1) return { kind: 'end', prominent: false, start: last.start };
  return { kind: 'start' };
}

/** The existing start that a new start on `day` would move (within 7 days after `day`). */
export function startShortlyAfter(history: readonly PeriodSpan[], day: string): string | undefined {
  for (const p of normalizeHistory(history)) {
    const gap = dayDiff(day, p.start);
    if (gap > 0 && gap <= MOVE_START_WINDOW_DAYS) return p.start;
  }
  return undefined;
}

export type PeriodStartResult = { ok: true; history: PeriodSpan[]; moved?: string } | { ok: false; reason: string };

/**
 * Log a period start on `day`: moves a start that follows within seven days
 * (instead of creating an impossible short cycle), refuses a day inside or just
 * after an existing period, and closes an older open period at its usual length.
 */
export function applyPeriodStart(history: readonly PeriodSpan[], day: string, rules: Pick<CycleRules, 'periodDays'>, today: string): PeriodStartResult {
  const h = normalizeHistory(history);
  if (day > today) return { ok: false, reason: 'A period cannot start on a future day.' };
  if (h.some((p) => p.start === day)) return { ok: true, history: h };
  const inside = h.find((p) => p.start < day && day <= periodEndOf(p, rules, today));
  if (inside) return { ok: false, reason: `That day is already inside the period that started ${inside.start}.` };
  const soonAfter = h.find((p) => p.start < day && dayDiff(p.start, day) <= MOVE_START_WINDOW_DAYS);
  if (soonAfter) return { ok: false, reason: 'Starts closer than eight days apart count as one period. Edit the earlier one instead.' };
  const moved = startShortlyAfter(h, day);
  if (moved) {
    const next = h.map((p) => (p.start === moved ? { ...p, start: day } : p));
    return { ok: true, history: closeOlderOpenSpans(normalizeHistory(next), rules), moved };
  }
  return { ok: true, history: closeOlderOpenSpans(normalizeHistory([...h, { start: day }]), rules) };
}

/** Every span but the latest gets an end (its usual length, never past the next start) when it has none. */
export function closeOlderOpenSpans(history: readonly PeriodSpan[], rules: Pick<CycleRules, 'periodDays'>): PeriodSpan[] {
  const h = normalizeHistory(history);
  return h.map((p, i) => {
    const next = h[i + 1];
    if (!next || p.end) return p;
    const typical = addDays(p.start, Math.max(1, rules.periodDays) - 1);
    const beforeNext = addDays(next.start, -1);
    return { ...p, end: typical < beforeNext ? typical : beforeNext };
  });
}

/** End the open period on `day` (no-op when nothing is open or the day precedes the start). */
export function applyPeriodEnd(history: readonly PeriodSpan[], day: string): PeriodSpan[] | null {
  const h = normalizeHistory(history);
  const last = h[h.length - 1];
  if (!last || last.end || day < last.start) return null;
  if (dayDiff(last.start, day) > OPEN_PERIOD_MAX_DAYS - 1) return null;
  h[h.length - 1] = { ...last, end: day };
  return h;
}
