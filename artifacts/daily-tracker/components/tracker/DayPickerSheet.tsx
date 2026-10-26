import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { UI } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/PressableScale';
import { IconButton, Row } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import type { Habit } from '@/src/domain/models';
import { formatDayShort } from '@/src/domain/time/format';
import { monthCells, monthOf, monthTitle, shiftMonth } from '@/src/domain/time/month';
import { parseDay } from '@/src/domain/time/trackingDay';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface DayPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
  today: string;
  /** Day → done ratio (0..1+) for the days that have one; drawn as a tint. */
  values: Record<string, number>;
  /** Days before this (and after today) cannot be picked. */
  firstDay: string;
  onPick: (day: string) => void;
}

/**
 * A month grid to pick an older day and fix its log (the 7-day strip on the habit page covers
 * the recent ones; the heatmap's cells are too small to tap). Days are tinted by how much of the
 * day's goal was done; days before the habit existed, and days to come, are not offered.
 */
export function DayPickerSheet({ visible, onClose, habit, today, values, firstDay, onPick }: DayPickerSheetProps) {
  const c = useColors();
  const [month, setMonth] = useState(() => monthOf(today));
  const cells = useMemo(() => monthCells(month), [month]);
  const color = c.cat[habit.category];
  const thisMonth = monthOf(today);
  const firstMonth = monthOf(firstDay);

  return (
    <Sheet visible={visible} title={`Fix an older day · ${habit.name}`} onClose={onClose}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 12 }}>
        Tap a day to change what was logged. The 7-day strip covers the recent days; this reaches back to {formatDayShort(firstDay)}, when the habit was added.
      </Txt>
      <Row style={styles.header}>
        <IconButton Glyph={UI.Back} label="Previous month" onPress={() => setMonth((m) => shiftMonth(m, -1))} size={36} color={month > firstMonth ? c.text : c.textTertiary} disabled={month <= firstMonth} />
        <PressableScale haptic={false} onPress={() => setMonth(thisMonth)} accessibilityRole="button" accessibilityLabel="Jump to this month" style={{ flex: 1 }}>
          <Txt role="title2" align="center">
            {monthTitle(month)}
          </Txt>
        </PressableScale>
        <IconButton Glyph={UI.Caret} label="Next month" onPress={() => setMonth((m) => shiftMonth(m, 1))} size={36} color={month < thisMonth ? c.text : c.textTertiary} disabled={month >= thisMonth} />
      </Row>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Txt key={`${w}-${i}`} role="caption" tone="tertiary" align="center" style={styles.weekday}>
            {w}
          </Txt>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`empty-${i}`} style={styles.cell} />;
          const open = day <= today && day >= firstDay;
          const ratio = values[day];
          const fill = open && ratio !== undefined && ratio > 0 ? withAlpha(color, Math.min(1, 0.25 + ratio * 0.6)) : undefined;
          const isToday = day === today;
          const n = parseDay(day).day;
          const a11y = [formatDayShort(day), isToday ? 'today' : '', !open ? 'not available' : ratio === undefined || ratio === 0 ? 'nothing logged' : ratio >= 1 ? 'goal met' : `${Math.round(ratio * 100)} percent of the goal`].filter(Boolean).join(', ');
          return (
            <PressableScale key={day} haptic={false} disabled={!open} onPress={() => onPick(day)} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !open }} style={styles.cell}>
              <View style={[styles.disc, fill ? { backgroundColor: fill } : null, isToday ? { borderColor: c.green, borderWidth: 2 } : null]}>
                <Txt role="callout" color={open ? c.text : c.textTertiary} align="center">
                  {String(n)}
                </Txt>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  header: { marginBottom: 6 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 2,
  },
  disc: {
    width: CELL - 4,
    height: CELL - 4,
    borderRadius: (CELL - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
