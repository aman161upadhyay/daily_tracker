import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { adherenceColor, FLOW_THRESHOLD, STAGE_LABELS } from '@/src/domain/adherence/adherenceScale';
import { withAlpha } from '@/src/domain/color/oklch';
import { formatHabitValue } from '@/src/domain/time/format';
import type { Habit, Units } from '@/src/domain/models';
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
  /** The volume unit the Water preset is shown in (Settings → Units). */
  units?: Units;
}

/** What the quick-log button really does for this habit: the sheet for an amount, a drink, a set, or one more. */
function quickLogLabel(habit: Habit): string {
  if (habit.type === 'AMOUNT') return `Log an amount for ${habit.name}`;
  if (habit.presetId === 'water') return `Add a drink to ${habit.name}`;
  if (habit.snackType) return `Log one ${habit.name}`;
  return `Add one to ${habit.name}`;
}

export function HabitRow({ view, onPress, onIncrement, onToggle, onTimer, nudgeText, last, units = 'ml' }: HabitRowProps) {
  const c = useColors();
  const { habit, rule, todayValue, target, adherence, streak, periodDone, periodQuota, periodLabel } = view;
  // The checkbox is about today: a weekly habit done today is checked even while its week still needs days.
  const done = view.doneToday;
  const flow = adherence >= FLOW_THRESHOLD;
  const fillColor = adherenceColor(adherence);
  const catColor = c.cat[habit.category];

  const weekly = rule.cadence !== 'DAILY';
  const progressText = weekly
    ? `${periodDone ?? 0} of ${periodQuota ?? rule.timesPerPeriod} ${periodLabel ?? 'this period'}${done ? ' · done today' : ''}`
    : habit.type === 'YES_NO'
      ? done
        ? 'Done today'
        : 'Not yet today'
      : `${formatHabitValue(habit, todayValue, units).value} of ${formatHabitValue(habit, target, units).value} ${formatHabitValue(habit, target, units).unit}`.trim();
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
          aria-checked={done}
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
        <PressableScale onPress={onTimer} accessibilityRole="button" accessibilityLabel={habit.mindKind ? `Start ${habit.name} timer` : `Log time for ${habit.name}`} style={styles.target}>
          <View style={[styles.check, { backgroundColor: done ? fillColor : c.surfaceRaised, borderColor: done ? fillColor : c.hairline }]}>
            {done ? <UI.Check size={16} color={c.onGreen} weight="bold" /> : <UI.Play size={14} color={c.text} weight="fill" />}
          </View>
        </PressableScale>
      ) : (
        <PressableScale onPress={onIncrement} accessibilityRole="button" accessibilityLabel={quickLogLabel(habit)} style={styles.target}>
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
    // A floor, not a height: at a 1.3 font scale the caption's line grew past 20 dp and clipped.
    minHeight: 20,
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
