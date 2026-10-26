import React from 'react';
import { METRIC_META, metricColor, metricDayValues } from '@/components/body/metrics';
import { SummaryCard } from '@/components/tracker/SummaryCard';
import { UI } from '@/components/ui/icons';
import { PillButton } from '@/components/ui/primitives';
import { useColors } from '@/hooks/useColors';
import { averageOf, bedtimeSpreadMin, formatSleep, lastNight, seriesOf, sleepClockMin } from '@/src/domain/body/stats';
import type { BodyState } from '@/src/domain/body/types';
import { formatClock, formatDayShort, formatNumber } from '@/src/domain/time/format';
import { lastNDays } from '@/src/domain/time/trackingDay';
import type { StepsCardView } from '@/src/domain/body/stepsCard';

/**
 * The Steps and Sleep summary cards, shared by the Body tab and Today's pinned cards so the
 * two screens read the same figures the same way (paradigm 21).
 */

export type { StepsCardView } from '@/src/domain/body/stepsCard';

export function stepsCardView(body: BodyState, calendarToday: string): StepsCardView {
  const steps = metricDayValues(body, 'steps');
  const series7 = seriesOf(steps, lastNDays(calendarToday, 7));
  return { present: steps.size > 0, today: steps.get(calendarToday) ?? 0, series7, avg7: averageOf(series7) };
}

export { stepsCardViewFromHabit } from '@/src/domain/body/stepsCard';

export interface SleepCardView {
  present: boolean;
  night: ReturnType<typeof lastNight>;
  series7: number[];
  bedSpread: number | undefined;
}

export function sleepCardView(body: BodyState, calendarToday: string, zone: string): SleepCardView {
  const sleep = metricDayValues(body, 'sleep');
  return {
    present: sleep.size > 0,
    night: lastNight(body, calendarToday),
    series7: seriesOf(sleep, lastNDays(calendarToday, 7)),
    bedSpread: bedtimeSpreadMin(body, calendarToday, zone),
  };
}

export function StepsSummaryCard({ view, goal, hasHabit, onPress, onAddHabit }: { view: StepsCardView; goal: number | undefined; hasHabit: boolean; onPress: () => void; onAddHabit: () => void }) {
  const c = useColors();
  return (
    <SummaryCard
      title={METRIC_META.steps.title}
      icon="steps"
      color={metricColor(c, 'steps')}
      value={formatNumber(view.today)}
      unit="steps"
      timestamp="Today"
      detail={
        goal
          ? `${view.today >= goal ? 'Goal reached' : `of ${formatNumber(goal)}`}${view.avg7 ? ` · 7-day avg ${formatNumber(view.avg7)}` : ''}`
          : view.avg7
            ? `7-day avg ${formatNumber(view.avg7)}`
            : undefined
      }
      chart={{ values: view.series7, goal }}
      onPress={onPress}
      footer={hasHabit ? undefined : <PillButton label="Add the Steps habit for a daily goal" kind="ghost" compact Leading={UI.Plus} onPress={onAddHabit} />}
    />
  );
}

export function SleepSummaryCard({ view, zone, onPress }: { view: SleepCardView & { night: NonNullable<SleepCardView['night']> }; zone: string; onPress: () => void }) {
  const c = useColors();
  const { night } = view;
  return (
    <SummaryCard
      title={METRIC_META.sleep.title}
      icon="moon"
      color={metricColor(c, 'sleep')}
      value={formatSleep(night.night.minutes)}
      unit="asleep"
      timestamp={night.isToday ? 'Last night' : `Night to ${formatDayShort(night.day)}`}
      detail={[
        `${formatClock(sleepClockMin(night.night, 'start', zone))} → ${formatClock(sleepClockMin(night.night, 'end', zone))}`,
        night.night.deepMin !== undefined ? `${formatSleep(night.night.deepMin)} deep` : undefined,
        view.bedSpread !== undefined ? `bedtime ±${view.bedSpread} min` : undefined,
      ]
        .filter(Boolean)
        .join(' · ')}
      chart={{ values: view.series7 }}
      onPress={onPress}
    />
  );
}
