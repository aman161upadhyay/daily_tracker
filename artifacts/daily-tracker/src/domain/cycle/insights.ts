/**
 * Symptom patterns and habit ↔ symptom correlations (ported from Cadence's
 * SymptomInsights / Correlations).
 *
 * - A pattern is the 3-day window, counted from the cycle start or back from
 *   the next start, that contains the symptom in at least 60 % of the cycles
 *   with any log (needs ≥ 3 such cycles).
 * - A correlation is Spearman's ρ between a habit's per-cycle adherence and
 *   a symptom's per-cycle burden (sum of severities); shown with n ≥ 4 cycles
 *   and |ρ| ≥ 0.5, worded as "tends to".
 */
import type { CycleDayLog } from '../models';
import { dayDiff } from '../time/trackingDay';

export const MIN_PATTERN_CYCLES = 3;
export const MIN_PATTERN_SHARE = 0.6;
export const PATTERN_WINDOW_DAYS = 3;
export const PATTERN_SEARCH_DAYS = 14;
export const MIN_CORRELATION_CYCLES = 4;
export const MIN_CORRELATION_RHO = 0.5;
/** A symptom must recur in this many cycles before its correlation is reported. */
export const MIN_SYMPTOM_CYCLES = 3;
export const MOOD_KEY = 'mood';

export interface CompletedCycle {
  start: string;
  /** Start of the following cycle (exclusive end of this one). */
  nextStart: string;
}

export interface SymptomPattern {
  key: string;
  /** Counted from the cycle start ('start', cycle days) or back from the next start ('next', days before). */
  anchor: 'start' | 'next';
  from: number;
  to: number;
  /** Fraction of logged cycles in which the window contained the symptom. */
  share: number;
  cycles: number;
}

function cycleOf(day: string, cycles: readonly CompletedCycle[]): number {
  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i]!;
    if (day >= c.start && day < c.nextStart) return i;
  }
  return -1;
}

/** Cycles in which the user logged anything at all (the denominator for patterns). */
export function loggedCycles(logs: readonly CycleDayLog[], cycles: readonly CompletedCycle[]): CompletedCycle[] {
  const seen = new Set<number>();
  for (const log of logs) {
    const i = cycleOf(log.day, cycles);
    if (i >= 0) seen.add(i);
  }
  return cycles.filter((_, i) => seen.has(i));
}

export function symptomPatterns(logs: readonly CycleDayLog[], allCycles: readonly CompletedCycle[]): SymptomPattern[] {
  const cycles = loggedCycles(logs, allCycles);
  if (cycles.length < MIN_PATTERN_CYCLES) return [];
  const keys = new Set<string>();
  for (const log of logs) for (const k of Object.keys(log.symptoms)) keys.add(k);

  const out: SymptomPattern[] = [];
  for (const key of keys) {
    // Per cycle: the symptom's days as (cycle day, days before next start).
    const perCycle: { fromStart: number; beforeNext: number }[][] = cycles.map(() => []);
    for (const log of logs) {
      if (!log.symptoms[key]) continue;
      const i = cycleOf(log.day, cycles);
      if (i < 0) continue;
      perCycle[i]!.push({ fromStart: dayDiff(cycles[i]!.start, log.day) + 1, beforeNext: dayDiff(log.day, cycles[i]!.nextStart) });
    }
    let best: { anchor: 'start' | 'next'; from: number; hits: number; days: number } | null = null;
    const consider = (anchor: 'start' | 'next', from: number) => {
      const to = from + PATTERN_WINDOW_DAYS - 1;
      let hits = 0;
      let days = 0;
      for (const list of perCycle) {
        const inWindow = list.filter((d) => (anchor === 'start' ? d.fromStart >= from && d.fromStart <= to : d.beforeNext >= from && d.beforeNext <= to)).length;
        if (inWindow > 0) hits += 1;
        days += inWindow;
      }
      if (!best || hits > best.hits || (hits === best.hits && days > best.days)) best = { anchor, from, hits, days };
    };
    for (let b = 1; b <= PATTERN_SEARCH_DAYS; b++) consider('next', b);
    for (let a = 1; a <= PATTERN_SEARCH_DAYS; a++) consider('start', a);
    const b = best as { anchor: 'start' | 'next'; from: number; hits: number; days: number } | null;
    if (!b) continue;
    const share = b.hits / cycles.length;
    if (share < MIN_PATTERN_SHARE) continue;
    out.push({ key, anchor: b.anchor, from: b.from, to: b.from + PATTERN_WINDOW_DAYS - 1, share, cycles: cycles.length });
  }
  return out.sort((a, b) => b.share - a.share || a.key.localeCompare(b.key));
}

export function describeWindow(p: Pick<SymptomPattern, 'anchor' | 'from' | 'to'>): string {
  if (p.anchor === 'next') return `${p.from}–${p.to} days before your period`;
  if (p.from === 1) return 'the first days of your period';
  return `days ${p.from}–${p.to} of your cycle`;
}

// ── Correlations ───────────────────────────────────────────────────────────

function ranks(values: readonly number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.v === indexed[i]!.v) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[indexed[k]!.i] = rank;
    i = j + 1;
  }
  return out;
}

/** Spearman's rank correlation with average ranks for ties; null without variance. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const rx = ranks(xs.slice(0, n));
  const ry = ranks(ys.slice(0, n));
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export interface HabitPerCycle {
  habitId: string;
  name: string;
  /** One adherence figure (0–1) per cycle, aligned with `cycles`. */
  perCycle: number[];
}

export interface Correlation {
  habitId: string;
  habitName: string;
  /** Symptom key, or `MOOD_KEY` for the mood average. */
  key: string;
  rho: number;
  n: number;
}

/** Symptom burden per cycle (sum of severities) and mean mood per cycle (NaN when never logged). */
export function symptomBurden(logs: readonly CycleDayLog[], cycles: readonly CompletedCycle[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const moodSum = cycles.map(() => 0);
  const moodN = cycles.map(() => 0);
  for (const log of logs) {
    const i = cycleOf(log.day, cycles);
    if (i < 0) continue;
    for (const [k, sev] of Object.entries(log.symptoms)) {
      if (!out.has(k)) out.set(k, cycles.map(() => 0));
      out.get(k)![i]! += sev;
    }
    if (log.mood !== undefined) {
      moodSum[i]! += log.mood;
      moodN[i]! += 1;
    }
  }
  if (moodN.some((n) => n > 0)) out.set(MOOD_KEY, moodSum.map((s, i) => (moodN[i]! > 0 ? s / moodN[i]! : NaN)));
  return out;
}

export function habitSymptomCorrelations(logs: readonly CycleDayLog[], allCycles: readonly CompletedCycle[], habits: readonly HabitPerCycle[]): Correlation[] {
  const cycles = loggedCycles(logs, allCycles);
  if (cycles.length < MIN_CORRELATION_CYCLES) return [];
  const keep = allCycles.map((c) => cycles.includes(c));
  const burden = symptomBurden(logs, cycles);
  const out: Correlation[] = [];
  for (const habit of habits) {
    const xsAll = habit.perCycle.filter((_, i) => keep[i]);
    for (const [key, ysAll] of burden) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < Math.min(xsAll.length, ysAll.length); i++) {
        if (Number.isNaN(ysAll[i]!) || Number.isNaN(xsAll[i]!)) continue;
        xs.push(xsAll[i]!);
        ys.push(ysAll[i]!);
      }
      if (xs.length < MIN_CORRELATION_CYCLES) continue;
      // A symptom that showed up in only a cycle or two says nothing about the habit.
      if (key !== MOOD_KEY && ys.filter((y) => y > 0).length < MIN_SYMPTOM_CYCLES) continue;
      const rho = spearman(xs, ys);
      if (rho === null || Math.abs(rho) < MIN_CORRELATION_RHO) continue;
      out.push({ habitId: habit.habitId, habitName: habit.name, key, rho, n: xs.length });
    }
  }
  return out.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
}

/** "Cycles where you did “Meditate” more often tended to have milder cramps." */
export function describeCorrelation(c: Correlation, symptomLabel: (key: string) => string): string {
  const habit = `“${c.habitName}”`;
  if (c.key === MOOD_KEY) return `Cycles where you did ${habit} more often tended to come with ${c.rho > 0 ? 'better' : 'lower'} mood.`;
  return `Cycles where you did ${habit} more often tended to have ${c.rho < 0 ? 'milder' : 'worse'} ${symptomLabel(c.key).toLowerCase()}.`;
}
