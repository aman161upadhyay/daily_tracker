import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { adherenceColor } from '@/src/domain/adherence/adherenceScale';
import { withAlpha } from '@/src/domain/color/oklch';
import type { PeriodResult } from '@/src/domain/habits/streaks';
import type { Habit, Units } from '@/src/domain/models';
import { formatHabitValue, formatWeekdayShort, habitAmountText } from '@/src/domain/time/format';
import { lastNDays } from '@/src/domain/time/trackingDay';
import { UI } from '../ui/icons';
import { PressableScale } from '../ui/PressableScale';
import { Txt } from '../ui/Txt';

export interface BackfillStripProps {
  habit: Habit;
  today: string;
  /** Per-day target: the rule in force on that day, so an edited goal never rewrites last week's ticks. */
  targetOf: (day: string) => number;
  valueOf: (day: string) => number;
  periods: PeriodResult[];
  onPressDay: (day: string, value: number) => void;
  /** The volume unit the Water preset is shown in. */
  units?: Units;
}

/**
 * The last seven tracking days as tappable cells. Tap to log a day you forgot
 * (yes/no toggles; everything else opens the amount sheet in "set" mode).
 * A snowflake marks a day the streak was frozen through.
 */
export function BackfillStrip({ habit, today, targetOf, valueOf, periods, onPressDay, units = 'ml' }: BackfillStripProps) {
  const c = useColors();
  const days = lastNDays(today, 7);
  const frozen = new Set(periods.filter((p) => p.status === 'FROZEN' && p.cadence === 'DAILY').map((p) => p.start));

  return (
    <View style={styles.row}>
      {days.map((day) => {
        const value = valueOf(day);
        const target = targetOf(day);
        const ratio = target > 0 ? Math.min(1, value / target) : value > 0 ? 1 : 0;
        const done = ratio >= 1;
        const before = day < habit.createdDay;
        const fill = done ? adherenceColor(1) : ratio > 0 ? withAlpha(adherenceColor(ratio), 0.45) : 'transparent';
        const isToday = day === today;
        const short = habit.type === 'YES_NO' ? '' : value > 0 ? formatHabitValue(habit, value, units).value : '';
        return (
          <PressableScale
            key={day}
            onPress={() => onPressDay(day, value)}
            disabled={before}
            accessibilityRole="button"
            accessibilityLabel={`${formatWeekdayShort(day)}${isToday ? ', today' : ''}: ${habit.type === 'YES_NO' ? (done ? 'done' : 'not done') : habitAmountText(habit, value, units)}. Tap to edit.`}
            style={[styles.cell, { opacity: before ? 0.3 : 1 }]}
          >
            <Txt role="caption" tone={isToday ? 'primary' : 'tertiary'}>
              {formatWeekdayShort(day).slice(0, 2)}
            </Txt>
            <View
              style={[
                styles.disc,
                {
                  backgroundColor: fill,
                  borderColor: done ? adherenceColor(1) : isToday ? c.textSecondary : c.hairline,
                },
              ]}
            >
              {done ? (
                <UI.Check size={14} color={c.onGreen} weight="bold" />
              ) : frozen.has(day) ? (
                <UI.Snowflake size={14} color={c.violetSoft} weight="fill" />
              ) : short ? (
                <Txt role="caption" tone="secondary">
                  {short.length > 4 ? `${short.slice(0, 3)}…` : short}
                </Txt>
              ) : null}
            </View>
            <Txt role="caption" tone="tertiary">
              {Number(day.slice(-2))}
            </Txt>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cell: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  disc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
