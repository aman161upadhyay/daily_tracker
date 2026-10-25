import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, Dot, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import { averageCycleLength, cycleDay, isPeriodOpen, lastPeriodStart, PHASE_LABELS, phaseOf, predictedNextStart } from '@/src/domain/cycle/predict';
import { formatDayLong, formatDayShort } from '@/src/domain/time/format';
import { dayDiff } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';

/** Opt-in cycle tab: current day and phase, prediction, period start/end, history. */
export default function CycleScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, calendarToday, actions } = useTracker();
  const cycle = state.settings.cycle;
  const color = c.cat.cycle;

  const info = useMemo(() => {
    const lastStart = lastPeriodStart(cycle.history);
    if (!lastStart) return null;
    const length = averageCycleLength(cycle.history, cycle.avgCycleDays);
    const day = cycleDay(calendarToday, lastStart);
    const next = predictedNextStart(lastStart, length);
    return { lastStart, length, day, next, phase: phaseOf(day, length, cycle.periodDays), until: dayDiff(calendarToday, next), open: isPeriodOpen(cycle.history) };
  }, [cycle, calendarToday]);

  const history = useMemo(() => {
    const sorted = [...cycle.history].sort((a, b) => (a.start < b.start ? 1 : -1));
    return sorted.map((p, i) => {
      const nextStart = sorted[i - 1]?.start;
      return { ...p, length: nextStart ? dayDiff(p.start, nextStart) : undefined };
    });
  }, [cycle.history]);

  return (
    <Screen>
      <ScreenHeader title="Cycle" subtitle={formatDayLong(calendarToday)} />

      {info ? (
        <Card featured={info.open}>
          <Row gap={12} style={{ alignItems: 'flex-start' }}>
            <IconTile Glyph={UI.Cycle} color={color} size={44} />
            <View style={{ flex: 1 }}>
              <Txt role="footnote" tone="secondary">
                {PHASE_LABELS[info.phase]}
              </Txt>
              <View style={styles.valueRow}>
                <Txt role="display">{`Day ${info.day}`}</Txt>
                <Txt role="callout" tone="secondary" style={{ marginBottom: 2 }}>
                  {`of about ${info.length}`}
                </Txt>
              </View>
            </View>
          </Row>
          <View style={[styles.prediction, { backgroundColor: withAlpha(color, 0.12) }]}>
            <Dot color={color} />
            <Txt role="callout" style={{ flex: 1 }}>
              {info.until > 0
                ? `Next period expected ${formatDayShort(info.next)} · in ${info.until} ${info.until === 1 ? 'day' : 'days'}`
                : info.until === 0
                  ? 'Period expected today'
                  : `Period expected ${formatDayShort(info.next)} · ${Math.abs(info.until)} ${Math.abs(info.until) === 1 ? 'day' : 'days'} late`}
            </Txt>
          </View>
          <Row gap={8} style={{ marginTop: 14 }}>
            {info.open ? (
              <PillButton label="Period ended today" color={color} onPress={() => actions.periodEnd()} style={{ flex: 1 }} />
            ) : (
              <PillButton label="Period started today" color={color} onPress={() => actions.periodStart()} style={{ flex: 1 }} />
            )}
          </Row>
        </Card>
      ) : (
        <Card featured>
          <Row gap={12}>
            <IconTile Glyph={UI.Cycle} color={color} size={44} />
            <View style={{ flex: 1 }}>
              <Txt role="title2">No cycles logged yet</Txt>
              <Txt role="footnote" tone="secondary">
                Predictions start after the first period; they sharpen after three.
              </Txt>
            </View>
          </Row>
          <PillButton label="Period started today" color={color} onPress={() => actions.periodStart()} style={{ marginTop: 14 }} />
        </Card>
      )}

      <Card>
        <Txt role="footnote" tone="tertiary">
          Predictions are averages of your own logged cycles, kept on this phone. They are not medical advice, and the wording of any reminder stays discreet.
        </Txt>
      </Card>

      {history.length > 0 ? (
        <>
          <SectionHeader title="History" />
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {history.map((p, i) => (
              <View key={p.start}>
                <Row style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Txt role="title2">{p.end ? `${formatDayShort(p.start)} – ${formatDayShort(p.end)}` : `${formatDayShort(p.start)} – ongoing`}</Txt>
                    <Txt role="footnote" tone="secondary">
                      {p.end ? `${dayDiff(p.start, p.end) + 1} days of period` : 'Period in progress'}
                    </Txt>
                  </View>
                  {p.length ? (
                    <Txt role="callout" tone="secondary">
                      {`${p.length}-day cycle`}
                    </Txt>
                  ) : null}
                </Row>
                {i < history.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <PillButton label="Cycle settings" kind="ghost" Leading={UI.Gear} onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  prediction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
  },
  historyRow: {
    minHeight: 60,
    paddingVertical: 10,
  },
});
