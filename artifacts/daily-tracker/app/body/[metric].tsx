import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { METRIC_META, formatWeight, isBodyMetric, metricColor, metricSeries, type BodyMetric } from '@/components/body/metrics';
import { WorkoutRow } from '@/components/body/WorkoutRow';
import { MetricChart, RANGE_OPTIONS, type Range } from '@/components/tracker/MetricChart';
import { Card } from '@/components/ui/Card';
import { Divider, IconTile, Row, SectionHeader, Segmented } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { isWalk } from '@/src/domain/body/exerciseTypes';
import { bedtimeSpreadMin, distinctWorkouts, formatSleep, nightEndingOn, originName } from '@/src/domain/body/stats';
import { formatClock, formatDayLong, formatNumber } from '@/src/domain/time/format';
import { lastNDays, minutesOfDay } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';
import { ruleFor } from '@/src/state/selectors';

const RANGE_WORDS: Record<Range, string> = { D: 'Last 7 days', W: 'Last 2 weeks', M: 'Last 30 days', '6M': 'Last 6 months', Y: 'Last year' };

/** One imported metric over time: chart per range, the numbers behind it, and the recent records. */
export default function BodyMetricScreen() {
  const c = useColors();
  const { metric: param } = useLocalSearchParams<{ metric: string }>();
  const metric: BodyMetric = isBodyMetric(param) ? param : 'steps';
  const { state, today, calendarToday, zone, dispatch } = useTracker();
  const [range, setRange] = useState<Range>('W');
  const body = state.body;
  const units = state.settings.units;
  const meta = METRIC_META[metric];
  const color = metricColor(c, metric);

  const stepsHabit = state.habits.find((h) => h.presetId === 'steps' && !h.archived);
  const goal = metric === 'steps' && stepsHabit ? ruleFor(state, stepsHabit.id, today)?.target : undefined;

  const series = useMemo(() => metricSeries(body, metric, calendarToday, range, units, goal), [body, metric, calendarToday, range, units, goal]);
  const weekly = range === '6M' || range === 'Y';

  const nights = useMemo(
    () =>
      metric === 'sleep'
        ? lastNDays(calendarToday, 14)
            .reverse()
            .map((day) => ({ day, night: nightEndingOn(body, day) }))
            .filter((x) => x.night)
        : [],
    [body, metric, calendarToday],
  );
  const bedSpread = metric === 'sleep' ? bedtimeSpreadMin(body, calendarToday, zone) : undefined;

  const workouts = useMemo(() => (metric === 'workouts' ? [...body.workouts].sort((a, b) => b.startAt - a.startAt) : []), [body, metric]);
  // Two sources' copies of one session show as one row (hiding it hides the copy that stands for them).
  const shownWorkouts = useMemo(() => distinctWorkouts(workouts.filter((w) => !w.hidden)).sort((a, b) => b.startAt - a.startAt), [workouts]);
  const hiddenWorkouts = workouts.filter((w) => w.hidden);

  const weights = useMemo(() => (metric === 'weight' ? [...body.weight].sort((a, b) => b.at - a.at).slice(0, 14) : []), [body, metric]);

  const sourceNames = useMemo(() => {
    const origins = new Set<string>();
    const add = (o?: string) => {
      const n = originName(o);
      if (n) origins.add(n);
    };
    if (metric === 'steps') body.steps.forEach((s) => add(s.origin));
    if (metric === 'sleep') body.sleep.forEach((s) => add(s.origin));
    if (metric === 'weight') body.weight.forEach((s) => add(s.origin));
    if (metric === 'workouts') body.workouts.forEach((s) => add(s.origin));
    return [...origins];
  }, [body, metric]);

  const bestLabel = metric === 'heart' ? 'Lowest' : metric === 'weight' ? 'Latest' : 'Best';
  const dailyValues = useMemo(() => {
    const m = metricSeries(body, metric, calendarToday, range === 'D' ? 'D' : range === 'W' ? 'W' : 'M', units, goal);
    return m.values;
  }, [body, metric, calendarToday, range, units, goal]);
  const present = dailyValues.filter((v) => v > 0);
  const best = present.length === 0 ? undefined : metric === 'heart' ? Math.min(...present) : metric === 'weight' ? present[present.length - 1] : Math.max(...present);

  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: meta.title }} />

      <Card>
        <Row gap={12}>
          <IconTile icon={meta.icon} color={color} size={40} />
          <View style={{ flex: 1 }}>
            <Txt role="title2" color={color}>
              {meta.title}
            </Txt>
            <Txt role="footnote" tone="secondary">
              {sourceNames.length > 0 ? `From ${sourceNames.join(', ')} via Health Connect` : meta.blurb}
            </Txt>
          </View>
        </Row>
      </Card>

      <Card>
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        <Txt role="footnote" tone="tertiary" style={{ marginTop: 10 }}>
          {weekly ? `${RANGE_WORDS[range]} · weekly averages` : RANGE_WORDS[range]}
        </Txt>
        <View style={{ marginTop: 10 }}>
          <MetricChart values={series.values} labels={series.labels} color={color} goal={series.goal} kind={series.kind} baseline={series.baseline} format={series.format} />
        </View>
      </Card>

      <Card>
        <Row style={styles.stats}>
          <Stat label="Average" value={series.average ?? '—'} />
          <Stat label={bestLabel} value={best !== undefined ? series.format(best) : '—'} />
          <Stat label="Days with data" value={`${series.daysWithData}`} />
        </Row>
        {metric === 'sleep' && bedSpread !== undefined ? (
          <>
            <Divider />
            <Txt role="footnote" tone="secondary" style={{ marginTop: 10 }}>
              {`Bedtime varies by about ${bedSpread} minutes night to night over the last week — ${bedSpread <= 30 ? 'regular' : bedSpread <= 60 ? 'fairly regular' : 'irregular'}. Regularity predicts how rested you feel at least as well as duration does.`}
            </Txt>
          </>
        ) : null}
        {metric === 'steps' && stepsHabit && goal ? (
          <>
            <Divider />
            <Txt role="footnote" tone="secondary" style={{ marginTop: 10 }}>
              {`Goal ${formatNumber(goal)} a day, from your Steps habit. Each day's total is written into the habit automatically; a total you type yourself takes precedence.`}
            </Txt>
          </>
        ) : null}
      </Card>

      {metric === 'sleep' && nights.length > 0 ? (
        <>
          <SectionHeader title="Recent nights" />
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {nights.map(({ day, night }, i) => (
              <View key={day}>
                <Row style={styles.listRow} gap={12}>
                  <View style={{ flex: 1 }}>
                    <Txt role="body">{day === calendarToday ? 'Last night' : formatDayLong(day)}</Txt>
                    <Txt role="footnote" tone="secondary">
                      {`${formatClock(minutesOfDay(night!.startAt, zone))} → ${formatClock(minutesOfDay(night!.endAt, zone))}`}
                      {night!.deepMin !== undefined ? ` · deep ${formatSleep(night!.deepMin)}` : ''}
                      {night!.remMin !== undefined ? ` · REM ${formatSleep(night!.remMin)}` : ''}
                    </Txt>
                  </View>
                  <Txt role="title2" color={color}>
                    {formatSleep(night!.minutes)}
                  </Txt>
                </Row>
                {i < nights.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {metric === 'weight' && weights.length > 0 ? (
        <>
          <SectionHeader title="Readings" />
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {weights.map((w, i) => {
              const f = formatWeight(w.kg, units);
              return (
                <View key={w.id}>
                  <Row style={styles.listRow} gap={12}>
                    <View style={{ flex: 1 }}>
                      <Txt role="body">{w.day === calendarToday ? 'Today' : formatDayLong(w.day)}</Txt>
                      <Txt role="footnote" tone="secondary">
                        {formatClock(minutesOfDay(w.at, zone))}
                        {originName(w.origin) ? ` · ${originName(w.origin)}` : ''}
                      </Txt>
                    </View>
                    <Txt role="title2" color={color}>
                      {f.value} {f.unit}
                    </Txt>
                  </Row>
                  {i < weights.length - 1 ? <Divider /> : null}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {metric === 'workouts' ? (
        <>
          <SectionHeader title="Sessions" />
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {shownWorkouts.length === 0 ? (
              <Txt role="footnote" tone="secondary" style={{ paddingVertical: 14 }}>
                No workouts imported yet.
              </Txt>
            ) : (
              shownWorkouts.slice(0, 30).map((w, i) => (
                <View key={w.id}>
                  <WorkoutRow workout={w} zone={zone} today={today} onToggleHidden={() => dispatch({ type: 'SET_WORKOUT_HIDDEN', id: w.id, hidden: true })} />
                  {i < Math.min(shownWorkouts.length, 30) - 1 ? <Divider /> : null}
                </View>
              ))
            )}
          </Card>
          <Txt role="footnote" tone="tertiary" style={{ marginTop: 8, marginHorizontal: 4 }}>
            {`Walks ${shownWorkouts.some((w) => isWalk(w.type)) ? 'are listed but ' : ''}do not count toward the weekly total or the Strength session habit. Hiding a session only hides it here.`}
          </Txt>
          {hiddenWorkouts.length > 0 ? (
            <>
              <SectionHeader title="Hidden" />
              <Card padded={false} style={{ paddingHorizontal: 16 }}>
                {hiddenWorkouts.map((w, i) => (
                  <View key={w.id}>
                    <WorkoutRow workout={w} zone={zone} today={today} onToggleHidden={() => dispatch({ type: 'SET_WORKOUT_HIDDEN', id: w.id, hidden: false })} />
                    {i < hiddenWorkouts.length - 1 ? <Divider /> : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <Txt role="footnote" tone="tertiary" style={{ marginTop: 12, marginHorizontal: 4 }}>
        {`Imported numbers are copies of what the source app measured, ${metric === 'sleep' ? 'filed under the morning you woke up' : metric === 'workouts' ? 'filed under the day each session started' : 'by calendar day in your time zone'}.`}
      </Txt>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt role="footnote" tone="secondary">
        {label}
      </Txt>
      <Txt role="title1">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  listRow: {
    minHeight: 56,
    paddingVertical: 10,
  },
});
