import React, { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AdherenceBar } from '@/components/tracker/AdherenceBar';
import { EvidenceBlock } from '@/components/tracker/EvidenceBlock';
import { Heatmap26w } from '@/components/tracker/Heatmap26w';
import { MetricChart, RANGE_OPTIONS, type Range } from '@/components/tracker/MetricChart';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconTile, PillButton, Row, SectionHeader, Segmented, Stepper } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { adherenceColor, FLOW_THRESHOLD, STAGE_LABELS } from '@/src/domain/adherence/adherenceScale';
import { withAlpha } from '@/src/domain/color/oklch';
import { formatDayShort, formatNumber, formatWeekdayShort } from '@/src/domain/time/format';
import { lastNDays } from '@/src/domain/time/trackingDay';
import { PRESET_BY_ID } from '@/src/library/presets';
import { useHabitView } from '@/src/state/hooks';
import { habitSeries, heatmapValues } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';

export default function HabitDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, today, actions } = useTracker();
  const habit = state.habits.find((h) => h.id === id);
  const view = useHabitView(habit);
  const [range, setRange] = useState<Range>('W');

  const preset = habit?.presetId ? PRESET_BY_ID[habit.presetId] : undefined;

  const chart = useMemo(() => {
    if (!habit) return null;
    const color = c.cat[habit.category];
    if (range === 'D') {
      const s = habitSeries(state, habit, today, 7);
      return { values: s.map((r) => r.value), labels: s.map((r) => formatWeekdayShort(r.day)), kind: 'bars' as const, color };
    }
    if (range === 'W') {
      const s = habitSeries(state, habit, today, 14);
      return { values: s.map((r) => r.value), labels: [formatDayShort(s[0]!.day), formatDayShort(s[6]!.day), formatDayShort(s[13]!.day)], kind: 'bars' as const, color };
    }
    if (range === 'M') {
      const s = habitSeries(state, habit, today, 30);
      return { values: s.map((r) => r.value), labels: [formatDayShort(s[0]!.day), formatDayShort(s[15]!.day), 'Today'], kind: 'bars' as const, color };
    }
    const days = range === '6M' ? 182 : 364;
    const s = habitSeries(state, habit, today, days);
    const weekly: number[] = [];
    for (let i = 0; i < s.length; i += 7) {
      const slice = s.slice(i, i + 7);
      weekly.push(Math.round((slice.reduce((a, r) => a + r.value, 0) / slice.length) * 10) / 10);
    }
    return {
      values: weekly,
      labels: [formatDayShort(s[0]!.day), formatDayShort(s[Math.floor(s.length / 2)]!.day), 'Today'],
      kind: 'line' as const,
      color,
    };
  }, [habit, range, state, today, c]);

  const heat = useMemo(() => (habit ? heatmapValues(state, habit, today) : {}), [habit, state, today]);

  if (!habit || !view || !chart) {
    return (
      <Screen topInset={false}>
        <Stack.Screen options={{ title: 'Habit' }} />
        <Card>
          <Txt role="body" tone="secondary">
            This habit no longer exists.
          </Txt>
        </Card>
      </Screen>
    );
  }

  const color = c.cat[habit.category];
  const fill = adherenceColor(view.adherence);
  const flow = view.adherence >= FLOW_THRESHOLD;
  const weekly = view.rule.cadence !== 'DAILY';
  const todayText = weekly
    ? `${view.weekDone ?? 0} of ${view.rule.timesPerPeriod}`
    : habit.type === 'YES_NO'
      ? view.todayRatio >= 1
        ? 'Done'
        : 'Not yet'
      : formatNumber(view.todayValue);
  const todayUnit = weekly ? 'this week' : habit.type === 'YES_NO' ? 'today' : `of ${formatNumber(view.target)} ${habit.unit} today`;
  const completed14 = view.ratios14.filter((r) => r.ratio >= 1).length;
  const last14 = lastNDays(today, 14);

  const archive = () => {
    const go = () => {
      actions.updateHabit(habit.id, { archived: true });
      router.back();
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Archive this habit?', 'Its history is kept; you can add it again from the Library.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: go },
    ]);
  };

  const unitStep = habit.presetId === 'water' ? 250 : habit.unit === 'steps' ? 500 : 1;

  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: habit.name }} />

      <Card featured={flow} glow={flow}>
        <Row gap={12} style={{ marginBottom: 14 }}>
          <IconTile icon={habit.icon} color={color} size={48} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">{habit.name}</Txt>
            <Txt role="footnote" tone="secondary">
              {preset?.ruleText ?? `${formatNumber(view.target)} ${habit.unit} a day`}
            </Txt>
          </View>
          <View style={[styles.stage, { backgroundColor: withAlpha(fill, 0.18) }]}>
            <Txt role="caption" color={flow ? c.violetSoft : c.text}>
              {STAGE_LABELS[view.stage]}
            </Txt>
          </View>
        </Row>
        <View style={styles.valueRow}>
          <Txt role="display">{todayText}</Txt>
          <Txt role="callout" tone="secondary" style={{ marginBottom: 2 }}>
            {todayUnit}
          </Txt>
        </View>
        <View style={{ marginTop: 14 }}>
          <AdherenceBar adherence={view.adherence} height={8} />
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Txt role="caption" tone="tertiary">
              14-day adherence
            </Txt>
            <Txt role="caption" tone="secondary">
              {Math.round(view.adherence * 100)}%
            </Txt>
          </Row>
        </View>
        {habit.type !== 'TIMER' ? (
          <Row gap={8} style={{ marginTop: 14 }}>
            {habit.type === 'YES_NO' ? (
              <PillButton label={view.todayRatio >= 1 ? 'Undo today' : 'Mark done'} Leading={UI.Check} onPress={() => actions.toggleYesNo(habit)} style={{ flex: 1 }} kind={view.todayRatio >= 1 ? 'ghost' : 'primary'} />
            ) : (
              <>
                <PillButton label={habit.presetId === 'water' ? '+250 ml' : `+1 ${habit.unit}`.trim()} Leading={UI.Plus} onPress={() => actions.increment(habit)} style={{ flex: 1 }} />
                <PillButton label="Undo" Leading={UI.Undo} kind="ghost" onPress={() => actions.decrement(habit)} />
              </>
            )}
          </Row>
        ) : (
          <PillButton label="Start timer" Leading={UI.Play} onPress={() => router.push({ pathname: '/mind', params: { kind: habit.mindKind ?? 'MEDITATION' } })} style={{ marginTop: 14 }} />
        )}
      </Card>

      <Card>
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        <View style={{ marginTop: 14 }}>
          <MetricChart values={chart.values} labels={chart.labels} color={chart.color} goal={habit.type === 'YES_NO' ? undefined : view.target} kind={chart.kind} unit={habit.unit} />
        </View>
      </Card>

      <Card>
        <Row style={styles.stats}>
          <Stat label="Streak" value={`${view.streak}`} unit={view.streak === 1 ? 'day' : 'days'} gold={view.streak >= 3} />
          <Stat label="Best" value={`${view.best}`} unit={view.best === 1 ? 'day' : 'days'} />
          <Stat label="Last 14 days" value={`${completed14}`} unit={`of ${last14.length}`} />
        </Row>
      </Card>

      <SectionHeader title="Last 26 weeks" />
      <Card>
        <Heatmap26w values={heat} today={today} createdDay={habit.createdDay} />
      </Card>

      {preset ? (
        <>
          <SectionHeader title="Why this matters" />
          <Card>
            <EvidenceBlock preset={preset} />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Nudges" />
      <Card>
        <Row gap={12}>
          <IconTile Glyph={UI.Bell} color={color} size={40} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">Remind me</Txt>
            <Txt role="footnote" tone="secondary">
              {preset?.nudgeText ?? 'No automatic reminders for custom habits yet'}
            </Txt>
          </View>
          <Switch
            value={view.policy?.enabled ?? false}
            disabled={!view.policy || view.policy.kind === 'NONE'}
            onValueChange={(v) => view.policy && actions.setPolicy({ ...view.policy, enabled: v })}
            trackColor={{ false: c.hairline, true: c.green }}
            thumbColor={c.text}
            accessibilityLabel="Remind me"
          />
        </Row>
        <Divider />
        <Txt role="footnote" tone="tertiary" style={{ marginTop: 10 }}>
          Nudges show on Today now; notifications with Done / Snooze / Swap arrive in the next milestone.
        </Txt>
      </Card>

      <SectionHeader title="Options" />
      <Card>
        {habit.type !== 'YES_NO' ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Txt role="title2">Daily target</Txt>
                <Txt role="footnote" tone="secondary">
                  Changes apply from today
                </Txt>
              </View>
              <Stepper value={view.target} onChange={(v) => actions.setTarget(habit, v)} step={unitStep} min={unitStep} label="daily target" format={(v) => `${formatNumber(v)} ${habit.unit}`} />
            </Row>
            <Divider />
          </>
        ) : null}
        <Row style={{ justifyContent: 'space-between', paddingVertical: 10 }}>
          <View>
            <Txt role="title2">Pin to Today</Txt>
            <Txt role="footnote" tone="secondary">
              Keeps this habit near the top
            </Txt>
          </View>
          <Switch value={habit.pinned} onValueChange={(v) => actions.updateHabit(habit.id, { pinned: v })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Pin to Today" />
        </Row>
        <Divider />
        <PillButton label="Archive habit" kind="danger" Leading={UI.Archive} onPress={archive} style={{ marginTop: 12 }} />
      </Card>
    </Screen>
  );
}

function Stat({ label, value, unit, gold }: { label: string; value: string; unit: string; gold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Txt role="footnote" tone="secondary">
        {label}
      </Txt>
      <Row gap={4} style={{ alignItems: 'baseline' }}>
        {gold ? <UI.Flame size={18} color={c.goldBright} weight="fill" /> : null}
        <Txt role="title1" tone={gold ? 'gold' : 'primary'}>
          {value}
        </Txt>
        <Txt role="caption" tone="tertiary">
          {unit}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 999,
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  stats: {
    justifyContent: 'space-between',
  },
});
