import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { adherenceColor, FLOW_THRESHOLD, STAGE_LABELS } from '@/src/domain/adherence/adherenceScale';
import { withAlpha } from '@/src/domain/color/oklch';
import { formatNumber } from '@/src/domain/time/format';
import type { HabitView } from '@/src/state/selectors';
import { IconTile, Row } from '../ui/primitives';
import { PressableScale } from '../ui/PressableScale';
import { Txt } from '../ui/Txt';
import { UI } from '../ui/icons';
import { AdherenceBar } from './AdherenceBar';

export interface HabitRowProps {
  view: HabitView;
  onPress: () => void;
  onIncrement: () => void;
  onDecrement?: () => void;
  onToggle: () => void;
  onTimer: () => void;
  nudgeText?: string;
  /** Hide the bottom hairline (last row in a card). */
  last?: boolean;
}

export function HabitRow({ view, onPress, onIncrement, onToggle, onTimer, nudgeText, last }: HabitRowProps) {
  const c = useColors();
  const { habit, rule, todayValue, target, adherence, streak, periodDone, periodQuota, periodLabel } = view;
  const done = view.todayRatio >= 1;
  const flow = adherence >= FLOW_THRESHOLD;
  const fillColor = adherenceColor(adherence);
  const catColor = c.cat[habit.category];

  const weekly = rule.cadence !== 'DAILY';
  const progressText = weekly
    ? `${periodDone ?? 0} of ${periodQuota ?? rule.timesPerPeriod} ${periodLabel ?? 'this period'}`
    : habit.type === 'YES_NO'
      ? done
        ? 'Done today'
        : 'Not yet today'
      : `${formatNumber(todayValue)} of ${formatNumber(target)} ${habit.unit}`.trim();
  const subline = nudgeText ? `${progressText} · ${nudgeText}` : progressText;

  return (
    <View style={[styles.row, !last ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline } : null]}>
      <PressableScale
        haptic={false}
        scaleTo={0.985}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}, ${subline}, ${STAGE_LABELS[view.stage]}`}
        style={styles.main}
      >
        <IconTile icon={habit.icon} color={catColor} size={40} />
        <View style={{ flex: 1 }}>
          <Row gap={8} style={{ marginBottom: 2 }}>
            <Txt role="title2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {habit.name}
            </Txt>
            {streak >= 3 ? (
              <View style={[styles.streak, { backgroundColor: withAlpha(c.gold, 0.16) }]}>
                <UI.Flame size={12} color={c.goldBright} weight="fill" />
                <Txt role="caption" tone="gold">
                  {streak}
                </Txt>
              </View>
            ) : null}
          </Row>
          <Txt role="footnote" tone="secondary" numberOfLines={1} style={{ marginBottom: 8 }}>
            {subline}
          </Txt>
          <AdherenceBar adherence={adherence} />
        </View>
      </PressableScale>

      {habit.type === 'YES_NO' ? (
        <PressableScale
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Undo ${habit.name}` : `Mark ${habit.name} done`}
          style={styles.target}
        >
          <View
            style={[
              styles.check,
              done
                ? { backgroundColor: fillColor, borderColor: flow ? c.gold : fillColor }
                : { backgroundColor: 'transparent', borderColor: c.textTertiary },
            ]}
          >
            {done ? <UI.Check size={16} color={c.onGreen} weight="bold" /> : null}
          </View>
        </PressableScale>
      ) : habit.type === 'TIMER' ? (
        <PressableScale onPress={onTimer} accessibilityRole="button" accessibilityLabel={`Start ${habit.name} timer`} style={styles.target}>
          <View style={[styles.check, { backgroundColor: done ? fillColor : c.surfaceRaised, borderColor: done ? fillColor : c.hairline }]}>
            {done ? <UI.Check size={16} color={c.onGreen} weight="bold" /> : <UI.Play size={14} color={c.text} weight="fill" />}
          </View>
        </PressableScale>
      ) : (
        <PressableScale onPress={onIncrement} accessibilityRole="button" accessibilityLabel={`Add one to ${habit.name}`} style={styles.target}>
          <View style={[styles.check, { backgroundColor: done ? fillColor : c.surfaceRaised, borderColor: done ? (flow ? c.gold : fillColor) : c.hairline }]}>
            {done ? <UI.Check size={16} color={c.onGreen} weight="bold" /> : <UI.Plus size={16} color={c.greenBright} weight="bold" />}
          </View>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 64,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 999,
  },
  target: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
