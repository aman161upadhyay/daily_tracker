import React, { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useBackOrHome } from '@/hooks/useBackOrHome';
import { AdherenceBar } from '@/components/tracker/AdherenceBar';
import { AmountSheet } from '@/components/tracker/AmountSheet';
import { BackfillStrip } from '@/components/tracker/BackfillStrip';
import { EvidenceBlock } from '@/components/tracker/EvidenceBlock';
import { HabitEditorSheet } from '@/components/tracker/HabitEditorSheet';
import { Heatmap26w } from '@/components/tracker/Heatmap26w';
import { MetricChart, RANGE_OPTIONS, type Range } from '@/components/tracker/MetricChart';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconButton, IconTile, PillButton, Row, SectionHeader, Segmented } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { adherenceColor, FLOW_THRESHOLD, STAGE_LABELS } from '@/src/domain/adherence/adherenceScale';
import { withAlpha } from '@/src/domain/color/oklch';
import { describeRule, formatClock, formatDayShort, formatNumber, formatVolume, formatWeekdayShort } from '@/src/domain/time/format';
import { lastNDays, minutesOfDay } from '@/src/domain/time/trackingDay';
import { PRESET_BY_ID } from '@/src/library/presets';
import { useHabitView } from '@/src/state/hooks';
import { habitDayValue, habitSeries, heatmapValues, latestRule } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';

export default function HabitDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const goBack = useBackOrHome();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, today, zone, actions } = useTracker();
  const habit = state.habits.find((h) => h.id === id);
  const view = useHabitView(habit);
  const [range, setRange] = useState<Range>('W');
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<{ mode: 'add' | 'set'; day?: string; current?: number } | null>(null);

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
    ? `${view.periodDone ?? 0} of ${view.periodQuota ?? view.rule.timesPerPeriod}`
    : habit.type === 'YES_NO'
      ? view.todayRatio >= 1
        ? 'Done'
        : 'Not yet'
      : formatNumber(view.todayValue);
  const todayUnit = weekly ? (view.periodLabel ?? 'this period') : habit.type === 'YES_NO' ? 'today' : `of ${formatNumber(view.target)} ${habit.unit} today`;
  const completed14 = view.ratios14.filter((r) => r.ratio >= 1).length;
  const last14 = lastNDays(today, 14);
  const periodNoun = view.rule.cadence === 'DAILY' ? 'day' : view.rule.cadence === 'WEEKLY' ? 'week' : 'month';
  const plural = (n: number) => (n === 1 ? periodNoun : `${periodNoun}s`);
  const isWater = habit.presetId === 'water';
  const units = state.settings.units;
  const todayWater = isWater ? state.water.filter((w) => w.day === today).sort((a, b) => b.at - a.at) : [];
  const editRule = latestRule(state, habit.id) ?? view.rule;
  const quickLabel = isWater
    ? (() => {
        const f = formatVolume(state.settings.tapSizeMl, units);
        return `+${f.value} ${f.unit}`;
      })()
    : habit.type === 'COUNT' && !habit.snackType
      ? `+1 ${habit.unit}`.trim()
      : habit.snackType
        ? 'Log one'
        : `Log ${habit.unit}`.trim();
  const quickAdd = () => {
    if (isWater || habit.type === 'COUNT' || habit.snackType) return actions.increment(habit);
    setAmount({ mode: 'add' });
  };
  const onBackfill = (day: string, value: number) => {
    if (habit.type === 'YES_NO') return actions.toggleYesNo(habit, day);
    setAmount({ mode: 'set', day, current: value });
  };

  const archive = () => {
    const go = () => {
      actions.updateHabit(habit.id, { archived: true });
      goBack();
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Archive this habit?', 'Its history is kept; you can add it again from the Library.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: go },
    ]);
  };
  const remove = () => {
    const go = () => {
      actions.deleteHabit(habit.id);
      goBack();
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Delete this habit?', 'Its logs are deleted too. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <Screen topInset={false}>
      <Stack.Screen options={{ title: habit.name, headerRight: () => <IconButton Glyph={UI.Edit} label="Edit habit" onPress={() => setEditing(true)} size={36} color={c.text} /> }} />

      <Card featured={flow} glow={flow}>
        <Row gap={12} style={{ marginBottom: 14 }}>
          <IconTile icon={habit.icon} color={color} size={48} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">{habit.name}</Txt>
            <Txt role="footnote" tone="secondary">
              {describeRule(habit, view.rule)}
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
        {habit.presetId === 'sugar-shield' ? (
          <Row gap={8} style={{ marginTop: 14 }}>
            <PillButton label="Start Sugar Shield" Leading={UI.Play} onPress={() => router.push('/shield')} style={{ flex: 1 }} />
            <PillButton label="Log one" kind="ghost" onPress={() => actions.increment(habit)} />
            <IconButton Glyph={UI.Undo} label={`Undo last ${habit.name} entry`} onPress={() => actions.decrement(habit)} size={48} color={c.text} />
          </Row>
        ) : habit.type !== 'TIMER' ? (
          <Row gap={8} style={{ marginTop: 14 }}>
            {habit.type === 'YES_NO' ? (
              <PillButton label={view.todayRatio >= 1 ? 'Undo today' : 'Mark done'} Leading={UI.Check} onPress={() => actions.toggleYesNo(habit)} style={{ flex: 1 }} kind={view.todayRatio >= 1 ? 'ghost' : 'primary'} />
            ) : (
              <>
                <PillButton label={quickLabel} Leading={UI.Plus} onPress={quickAdd} style={{ flex: 1 }} />
                {isWater || habit.type === 'COUNT' || habit.snackType ? <PillButton label="Other" kind="ghost" onPress={() => setAmount({ mode: 'add' })} /> : null}
                <IconButton Glyph={UI.Undo} label={`Undo last ${habit.name} entry`} onPress={() => actions.decrement(habit)} size={48} color={c.text} />
              </>
            )}
          </Row>
        ) : (
          <Row gap={8} style={{ marginTop: 14 }}>
            {habit.mindKind ? <PillButton label="Start timer" Leading={UI.Play} onPress={() => router.push({ pathname: '/mind', params: { kind: habit.mindKind ?? 'MEDITATION' } })} style={{ flex: 1 }} /> : null}
            <PillButton label="Log minutes" Leading={UI.Plus} kind={habit.mindKind ? 'ghost' : 'primary'} onPress={() => setAmount({ mode: 'add' })} style={habit.mindKind ? undefined : { flex: 1 }} />
          </Row>
        )}
      </Card>

      <SectionHeader title="Last 7 days" />
      <Card>
        <BackfillStrip habit={habit} today={today} target={view.target} valueOf={(d) => habitDayValue(state, habit, d)} periods={view.periods} onPressDay={onBackfill} />
        <Txt role="caption" tone="tertiary" align="center" style={{ marginTop: 12 }}>
          {habit.createdDay >= today
            ? 'Added today — from tomorrow, tap a day here to fix a missed log.'
            : habit.createdDay > lastNDays(today, 7)[0]!
              ? `Forgot to log? Tap a day to fix it. Days before ${formatDayShort(habit.createdDay)}, when this habit was added, stay empty.`
              : 'Forgot to log? Tap a day to fix it.'}
        </Txt>
      </Card>

      {isWater ? (
        <>
          <SectionHeader title="Today's water" />
          <Card>
            {todayWater.length === 0 ? (
              <Txt role="body" tone="secondary">
                Nothing logged yet today.
              </Txt>
            ) : (
              todayWater.map((w, i) => {
                const f = formatVolume(w.ml, units);
                return (
                  <View key={w.id}>
                    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                      <Row gap={10}>
                        <UI.Drop size={18} color={c.cat.hydration} weight="fill" />
                        <Txt role="body">
                          {f.value} {f.unit}
                        </Txt>
                        <Txt role="footnote" tone="tertiary">
                          {formatClock(minutesOfDay(w.at, zone))}
                          {w.source === 'AUTO_WIDGET' ? ' · widget' : ''}
                        </Txt>
                      </Row>
                      <IconButton Glyph={UI.Trash} label={`Delete ${f.value} ${f.unit} entry`} onPress={() => actions.removeLog('water', w.id)} size={36} color={c.textSecondary} />
                    </Row>
                    {i < todayWater.length - 1 ? <Divider /> : null}
                  </View>
                );
              })
            )}
          </Card>
        </>
      ) : null}

      <Card>
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        <View style={{ marginTop: 14 }}>
          <MetricChart values={chart.values} labels={chart.labels} color={chart.color} goal={habit.type === 'YES_NO' ? undefined : view.target} kind={chart.kind} unit={habit.unit} />
        </View>
      </Card>

      <Card>
        <Row style={styles.stats}>
          <Stat label="Streak" value={`${view.streak}`} unit={plural(view.streak)} gold={view.streak >= 3} />
          <Stat label="Best" value={`${view.best}`} unit={plural(view.best)} />
          <Stat label="Last 14 days" value={`${completed14}`} unit={`of ${last14.length}`} />
        </Row>
        <Divider />
        <Row gap={8} style={{ marginTop: 10 }}>
          <UI.Snowflake size={16} color={c.violetSoft} weight="fill" />
          <Txt role="footnote" tone="secondary" style={{ flex: 1 }}>
            {view.freezesLeftThisMonth === 0
              ? `No streak freezes left this month (${view.rule.freezesPerMonth} a month).`
              : `${view.freezesLeftThisMonth} of ${view.rule.freezesPerMonth} streak freezes left this month. A missed ${periodNoun} uses one instead of resetting.`}
          </Txt>
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
          {view.policy && view.policy.kind !== 'NONE'
            ? 'Reminders arrive as notifications with Done, Snooze and Swap buttons, inside your active hours and daily cap (Settings → Reminders).'
            : 'This habit has no automatic reminder; a Today nudge still points to it when it is next in line.'}
        </Txt>
      </Card>

      <SectionHeader title="Options" />
      <Card>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <View style={{ flex: 1 }}>
            <Txt role="title2">Rule</Txt>
            <Txt role="footnote" tone="secondary">
              {describeRule(habit, view.rule)} · {view.rule.freezesPerMonth} freezes a month
            </Txt>
          </View>
          <PillButton label="Edit" kind="ghost" Leading={UI.Edit} compact onPress={() => setEditing(true)} />
        </Row>
        <Divider />
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
        <Row gap={8} style={{ marginTop: 12 }}>
          <PillButton label="Archive" kind="ghost" Leading={UI.Archive} onPress={archive} style={{ flex: 1 }} />
          {!habit.presetId ? <PillButton label="Delete" kind="danger" Leading={UI.Trash} onPress={remove} style={{ flex: 1 }} /> : null}
        </Row>
      </Card>

      <HabitEditorSheet visible={editing} onClose={() => setEditing(false)} habit={habit} rule={editRule} />
      {amount ? <AmountSheet visible onClose={() => setAmount(null)} habit={habit} mode={amount.mode} day={amount.day} current={amount.current} /> : null}
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
