/**
 * Presentation helpers for the Body tab: per-metric names, colours and the
 * chart series for each range. Numbers come from `src/domain/body/stats.ts`.
 */
import type { Range } from '@/components/tracker/MetricChart';
import type { Colors } from '@/hooks/useColors';
import { BODY_METRICS, bucketWeekly, formatSleep, heartByDay, restingOf, seriesOf, sleepByDay, stepsByDay, weightByDay, workoutMinutesByDay, type BodyMetric } from '@/src/domain/body/stats';
import type { BodyState } from '@/src/domain/body/types';
import type { HabitIcon, Units } from '@/src/domain/models';
import { formatDayShort, formatNumber, formatWeekdayShort } from '@/src/domain/time/format';
import { lastNDays } from '@/src/domain/time/trackingDay';

export { BODY_METRICS };
export type { BodyMetric };

export interface MetricMeta {
  title: string;
  icon: HabitIcon;
  /** One line under the card title on the tab. */
  blurb: string;
}

export const METRIC_META: Record<BodyMetric, MetricMeta> = {
  steps: { title: 'Steps', icon: 'steps', blurb: 'Counted by your phone or watch' },
  sleep: { title: 'Sleep', icon: 'moon', blurb: 'Time asleep, by the night it ended' },
  heart: { title: 'Resting heart rate', icon: 'heart', blurb: 'Lowest steady rate each day' },
  weight: { title: 'Weight', icon: 'barbell', blurb: 'From a connected scale or typed in another app' },
  workouts: { title: 'Workouts', icon: 'lightning', blurb: 'Exercise sessions other apps recorded' },
};

export function isBodyMetric(x: string | undefined): x is BodyMetric {
  return !!x && (BODY_METRICS as string[]).includes(x);
}

export function metricColor(c: Colors, metric: BodyMetric): string {
  switch (metric) {
    case 'steps':
      return c.cat.movement;
    case 'sleep':
      return c.cat.mind;
    case 'heart':
      return c.danger;
    case 'weight':
      return c.cat.body;
    case 'workouts':
      return c.cat.fuel;
  }
}

export function formatWeight(kg: number, units: Units): { value: string; unit: string } {
  if (units === 'oz') return { value: (kg * 2.20462).toFixed(1), unit: 'lb' };
  return { value: kg.toFixed(1), unit: 'kg' };
}

export function formatWeightDelta(kg: number, units: Units): string {
  const f = formatWeight(Math.abs(kg), units);
  const sign = kg > 0 ? '+' : kg < 0 ? '−' : '±';
  return `${sign}${f.value} ${f.unit}`;
}

const RANGE_DAYS: Record<Range, number> = { D: 7, W: 14, M: 30, '6M': 182, Y: 364 };

export interface MetricSeries {
  values: number[];
  /** One value per day of the range, oldest first, before any weekly bucketing (0 = no reading). */
  daily: number[];
  labels: string[];
  kind: 'bars' | 'line';
  goal?: number;
  baseline?: number;
  format: (v: number) => string;
  /** Average over the range (empty days ignored), already formatted. */
  average?: string;
  /** How many days in the range had a value. */
  daysWithData: number;
}

/** Per-day value map for a metric. Heart uses the resting rate, weight the day's last reading. */
export function metricDayValues(body: BodyState, metric: BodyMetric): Map<string, number> {
  switch (metric) {
    case 'steps':
      return stepsByDay(body);
    case 'sleep':
      return sleepByDay(body);
    case 'heart': {
      const m = new Map<string, number>();
      for (const [day, h] of heartByDay(body)) {
        const r = restingOf(h);
        if (r !== undefined) m.set(day, r);
      }
      return m;
    }
    case 'weight':
      return weightByDay(body);
    case 'workouts':
      return workoutMinutesByDay(body);
  }
}

export function metricFormatter(metric: BodyMetric, units: Units): (v: number) => string {
  switch (metric) {
    case 'steps':
      return (v) => formatNumber(v);
    case 'sleep':
    case 'workouts':
      return (v) => formatSleep(v);
    case 'heart':
      return (v) => `${Math.round(v)} bpm`;
    case 'weight':
      return (v) => {
        const f = formatWeight(v, units);
        return `${f.value} ${f.unit}`;
      };
  }
}

export function metricSeries(body: BodyState, metric: BodyMetric, today: string, range: Range, units: Units, goal?: number): MetricSeries {
  const map = metricDayValues(body, metric);
  const days = lastNDays(today, RANGE_DAYS[range]);
  const daily = seriesOf(map, days);
  const format = metricFormatter(metric, units);
  const level = metric === 'heart' || metric === 'weight';
  const weekly = range === '6M' || range === 'Y';
  // Long ranges show the weekly average of recorded days (a week with a gap is not a lower week).
  const values = weekly ? bucketWeekly(daily, 'avg') : daily;
  const present = daily.filter((v) => v > 0);
  const avg = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : undefined;

  let labels: string[];
  if (range === 'D') labels = days.map((d) => formatWeekdayShort(d));
  else if (range === 'W') labels = [formatDayShort(days[0]!), formatDayShort(days[6]!), formatDayShort(days[13]!)];
  else labels = [formatDayShort(days[0]!), formatDayShort(days[Math.floor(days.length / 2)]!), 'Today'];

  let baseline: number | undefined;
  if (level && present.length > 0) {
    const min = Math.min(...present);
    baseline = metric === 'weight' ? Math.floor(min - 1) : Math.max(0, Math.floor(min / 5) * 5 - 5);
  }

  return {
    values,
    daily,
    labels,
    kind: level || weekly ? 'line' : 'bars',
    ...(goal !== undefined && metric === 'steps' ? { goal } : {}),
    ...(baseline !== undefined ? { baseline } : {}),
    format,
    ...(avg !== undefined ? { average: format(avg) } : {}),
    daysWithData: present.length,
  };
}
