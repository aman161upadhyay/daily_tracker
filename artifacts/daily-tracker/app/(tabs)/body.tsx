import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ConnectionCard } from '@/components/body/ConnectionCard';
import { BODY_METRICS, METRIC_META, formatWeight, formatWeightDelta, metricColor, metricDayValues, type BodyMetric } from '@/components/body/metrics';
import { SummaryCard } from '@/components/tracker/SummaryCard';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { useHealthConnect } from '@/hooks/useHealthConnect';
import { exerciseLabel } from '@/src/domain/body/exerciseTypes';
import { averageOf, bedtimeSpreadMin, countedWorkouts, formatSleep, lastNight, latestResting, latestWeight, originName, seriesOf, workoutsThisWeek } from '@/src/domain/body/stats';
import type { BodyRecordType } from '@/src/domain/body/types';
import type { HabitIcon } from '@/src/domain/models';
import { formatClock, formatDayShort, formatNumber } from '@/src/domain/time/format';
import { lastNDays, minutesOfDay } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';
import { ruleFor } from '@/src/state/selectors';

const IMPORTS: { icon: HabitIcon; title: string; detail: string }[] = [
  { icon: 'steps', title: 'Steps', detail: 'Fills the Steps habit automatically' },
  { icon: 'moon', title: 'Sleep', detail: 'Duration, stages and regularity' },
  { icon: 'heart', title: 'Resting heart rate', detail: 'Daily trend' },
  { icon: 'lightning', title: 'Workouts', detail: 'Strength sessions tick the habit' },
  { icon: 'barbell', title: 'Weight', detail: 'From a scale or another app' },
  { icon: 'drop', title: 'Water from other apps', detail: 'Merged into the water log; manual entries win' },
];

const GRANT_FOR: Record<BodyMetric, BodyRecordType[]> = {
  steps: ['Steps'],
  sleep: ['SleepSession'],
  heart: ['HeartRate', 'RestingHeartRate'],
  weight: ['Weight'],
  workouts: ['ExerciseSession'],
};

/**
 * Body tab: what other apps measured, mirrored from Health Connect. On web
 * and in Expo Go the connection card says so; sample data is labelled.
 */
export default function BodyScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, today, calendarToday, nowMs, zone } = useTracker();
  const hc = useHealthConnect();
  const body = state.body;
  const units = state.settings.units;

  const hasData = body.steps.length + body.sleep.length + body.heart.length + body.weight.length + body.workouts.length > 0;
  const stepsHabit = state.habits.find((h) => h.presetId === 'steps' && !h.archived);
  const stepsGoal = stepsHabit ? ruleFor(state, stepsHabit.id, today)?.target : undefined;

  const days7 = useMemo(() => lastNDays(calendarToday, 7), [calendarToday]);
  const days14 = useMemo(() => lastNDays(calendarToday, 14), [calendarToday]);
  const days30 = useMemo(() => lastNDays(calendarToday, 30), [calendarToday]);

  const view = useMemo(() => {
    const steps = metricDayValues(body, 'steps');
    const sleep = metricDayValues(body, 'sleep');
    const heart = metricDayValues(body, 'heart');
    const weight = metricDayValues(body, 'weight');
    const workouts = metricDayValues(body, 'workouts');
    return {
      stepsToday: steps.get(calendarToday) ?? 0,
      steps7: seriesOf(steps, days7),
      stepsAvg7: averageOf(seriesOf(steps, days7)),
      night: lastNight(body, calendarToday),
      sleep7: seriesOf(sleep, days7),
      sleepAvg7: averageOf(seriesOf(sleep, days7)),
      bedSpread: bedtimeSpreadMin(body, calendarToday, zone),
      resting: latestResting(body),
      heart14: seriesOf(heart, days14),
      heartAvg7: averageOf(seriesOf(heart, days7)),
      weightLatest: latestWeight(body),
      weight30: seriesOf(weight, days30),
      week: workoutsThisWeek(body, today),
      lastWorkout: [...countedWorkouts(body)].sort((a, b) => b.startAt - a.startAt)[0],
      workouts7: seriesOf(workouts, days7),
      present: {
        steps: steps.size > 0,
        sleep: sleep.size > 0,
        heart: heart.size > 0,
        weight: weight.size > 0,
        workouts: body.workouts.length > 0,
      } as Record<BodyMetric, boolean>,
    };
  }, [body, calendarToday, today, zone, days7, days14, days30]);

  const visible = BODY_METRICS.filter((m) => view.present[m] || (hc.connected && GRANT_FOR[m].some((t) => hc.granted.includes(t))));
  const open = (metric: BodyMetric) => router.push({ pathname: '/body/[metric]', params: { metric } });

  const subtitle = hc.connected ? 'Health Connect' : state.settings.sampleData && hasData ? 'Sample data' : 'From Health Connect';

  return (
    <Screen>
      <ScreenHeader title="Body" subtitle={subtitle} />

      <ConnectionCard hc={hc} nowMs={nowMs} zone={zone} sample={state.settings.sampleData && hasData} hasData={hasData} />

      {visible.length === 0 ? (
        <>
          <SectionHeader title="What will appear here" />
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {IMPORTS.map((item, i) => (
              <View key={item.title}>
                <Row gap={12} style={styles.row}>
                  <IconTile icon={item.icon} color={c.cat.body} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt role="title2">{item.title}</Txt>
                    <Txt role="footnote" tone="secondary">
                      {item.detail}
                    </Txt>
                  </View>
                </Row>
                {i < IMPORTS.length - 1 ? <Divider inset={52} /> : null}
              </View>
            ))}
          </Card>

          <SectionHeader title="Until then" />
          <Card>
            <Txt role="body">
              {stepsHabit ? 'Your Steps habit is in the list; log a total by hand from its page.' : 'Add the Steps habit from the Library to log a daily total by hand.'}
            </Txt>
            <PillButton
              label={stepsHabit ? 'Open Steps' : 'Open the Library'}
              kind="ghost"
              Leading={UI.Caret}
              onPress={() => (stepsHabit ? router.push({ pathname: '/habit/[id]', params: { id: stepsHabit.id } }) : router.push('/habits'))}
              style={{ marginTop: 12, alignSelf: 'flex-start' }}
            />
          </Card>
        </>
      ) : null}

      {visible.includes('steps') ? (
        view.present.steps ? (
          <SummaryCard
            title={METRIC_META.steps.title}
            icon="steps"
            color={metricColor(c, 'steps')}
            value={formatNumber(view.stepsToday)}
            unit="steps"
            timestamp="Today"
            detail={
              stepsGoal
                ? `${view.stepsToday >= stepsGoal ? 'Goal reached' : `of ${formatNumber(stepsGoal)}`}${view.stepsAvg7 ? ` · 7-day avg ${formatNumber(view.stepsAvg7)}` : ''}`
                : view.stepsAvg7
                  ? `7-day avg ${formatNumber(view.stepsAvg7)}`
                  : undefined
            }
            chart={{ values: view.steps7, goal: stepsGoal }}
            onPress={() => open('steps')}
            footer={
              stepsHabit ? undefined : (
                <PillButton label="Add the Steps habit for a daily goal" kind="ghost" compact Leading={UI.Plus} onPress={() => router.push('/habits')} />
              )
            }
          />
        ) : (
          <EmptyMetric metric="steps" />
        )
      ) : null}

      {visible.includes('sleep') ? (
        view.present.sleep && view.night ? (
          <SummaryCard
            title={METRIC_META.sleep.title}
            icon="moon"
            color={metricColor(c, 'sleep')}
            value={formatSleep(view.night.night.minutes)}
            unit="asleep"
            timestamp={view.night.isToday ? 'Last night' : `Night to ${formatDayShort(view.night.day)}`}
            detail={[
              `${formatClock(minutesOfDay(view.night.night.startAt, zone))} → ${formatClock(minutesOfDay(view.night.night.endAt, zone))}`,
              view.night.night.deepMin !== undefined ? `${formatSleep(view.night.night.deepMin)} deep` : undefined,
              view.bedSpread !== undefined ? `bedtime ±${view.bedSpread} min` : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
            chart={{ values: view.sleep7 }}
            onPress={() => open('sleep')}
          />
        ) : (
          <EmptyMetric metric="sleep" />
        )
      ) : null}

      {visible.includes('heart') ? (
        view.present.heart && view.resting ? (
          <SummaryCard
            title={METRIC_META.heart.title}
            icon="heart"
            color={metricColor(c, 'heart')}
            value={`${view.resting.bpm}`}
            unit="bpm"
            timestamp={view.resting.day === calendarToday ? 'Today' : formatDayShort(view.resting.day)}
            detail={view.heartAvg7 ? `7-day avg ${Math.round(view.heartAvg7)} bpm` : undefined}
            chart={{ values: view.heart14, kind: 'line', baseline: Math.max(0, Math.min(...view.heart14.filter((v) => v > 0)) - 5) }}
            onPress={() => open('heart')}
          />
        ) : (
          <EmptyMetric metric="heart" />
        )
      ) : null}

      {visible.includes('weight') ? (
        view.present.weight && view.weightLatest ? (
          <SummaryCard
            title={METRIC_META.weight.title}
            icon="barbell"
            color={metricColor(c, 'weight')}
            value={formatWeight(view.weightLatest.kg, units).value}
            unit={formatWeight(view.weightLatest.kg, units).unit}
            timestamp={view.weightLatest.day === calendarToday ? 'Today' : formatDayShort(view.weightLatest.day)}
            detail={view.weightLatest.delta30 !== undefined ? `${formatWeightDelta(view.weightLatest.delta30, units)} over 30 days` : 'First month of readings'}
            chart={{ values: view.weight30, kind: 'line', baseline: Math.floor(Math.min(...view.weight30.filter((v) => v > 0)) - 1) }}
            onPress={() => open('weight')}
          />
        ) : (
          <EmptyMetric metric="weight" />
        )
      ) : null}

      {visible.includes('workouts') ? (
        view.present.workouts ? (
          <SummaryCard
            title={METRIC_META.workouts.title}
            icon="lightning"
            color={metricColor(c, 'workouts')}
            value={`${view.week.length}`}
            unit="this week"
            timestamp={view.week.length > 0 ? formatSleep(view.week.reduce((a, w) => a + w.minutes, 0)) : undefined}
            detail={
              view.lastWorkout
                ? `Last: ${exerciseLabel(view.lastWorkout.type, view.lastWorkout.title)} · ${formatSleep(view.lastWorkout.minutes)} · ${view.lastWorkout.day === today ? 'today' : formatDayShort(view.lastWorkout.day)}`
                : 'No sessions imported yet'
            }
            chart={{ values: view.workouts7 }}
            onPress={() => open('workouts')}
          />
        ) : (
          <EmptyMetric metric="workouts" />
        )
      ) : null}

      {visible.length > 0 ? (
        <>
          <SectionHeader title="How imports behave" />
          <Card>
            <Rule text="Steps fill the Steps habit for the day. A total you type yourself stays; the imported one is replaced, never added to it." />
            <Divider />
            <Rule text="A strength-type workout of 15+ minutes ticks Strength session for its day, once." />
            <Divider />
            <Rule text="A drink logged in another app joins the water log once. If you logged the same drink here within five minutes, yours wins." />
            <Divider />
            <Rule text="Workouts you hide stay hidden on the next sync. Nothing is written back to Health Connect." />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function EmptyMetric({ metric }: { metric: BodyMetric }) {
  const c = useColors();
  const router = useRouter();
  const meta = METRIC_META[metric];
  return (
    <Card>
      <Row gap={12}>
        <IconTile icon={meta.icon} color={metricColor(c, metric)} size={40} />
        <View style={{ flex: 1 }}>
          <Txt role="title2">{meta.title}</Txt>
          <Txt role="footnote" tone="secondary">
            Nothing in Health Connect yet · {meta.blurb.toLowerCase()}
          </Txt>
        </View>
      </Row>
      <PillButton label="Which app provides this?" kind="ghost" compact Leading={UI.Info} onPress={() => router.push('/body/setup')} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
    </Card>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <Txt role="footnote" tone="secondary" style={{ paddingVertical: 8 }}>
      {text}
    </Txt>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    paddingVertical: 10,
  },
});
