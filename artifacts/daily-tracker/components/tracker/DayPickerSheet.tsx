import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { UI } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/PressableScale';
import { IconButton, Row } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { inkFor, readableFill, withAlpha } from '@/src/domain/color/oklch';
import type { Habit } from '@/src/domain/models';
import { formatDayLong, formatDayShort } from '@/src/domain/time/format';
import { monthCells, monthOf, monthTitle, shiftMonth, weekdayLetters } from '@/src/domain/time/month';
import { weekStartIndex } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';
import { parseDay } from '@/src/domain/time/trackingDay';


export interface DayPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
  today: string;
  /**
   * Day → done ratio (0..1+) for the days asked about (a month at a time: the picker reaches
   * back to the habit's first day, further than any precomputed strip). Days without a ratio
   * read as nothing logged.
   */
  ratiosFor: (days: string[]) => Record<string, number>;
  /** Days before this (and after today) cannot be picked. */
  firstDay: string;
  onPick: (day: string) => void;
}

/**
 * A month grid to pick an older day and fix its log (the 7-day strip on the habit page covers
 * the recent ones; the heatmap's cells are too small to tap). Days are tinted by how much of the
 * day's goal was done; days before the habit existed, and days to come, are not offered.
 */
export function DayPickerSheet({ visible, onClose, habit, today, ratiosFor, firstDay, onPick }: DayPickerSheetProps) {
  const c = useColors();
  const [month, setMonth] = useState(() => monthOf(today));
  const weekStart = weekStartIndex(useTracker().state.settings.weekStart);
  const cells = useMemo(() => monthCells(month, weekStart), [month, weekStart]);
  const weekdays = useMemo(() => weekdayLetters(weekStart), [weekStart]);
  const values = useMemo(() => ratiosFor(cells.filter((d): d is string => d !== null && d <= today && d >= firstDay)), [cells, ratiosFor, today, firstDay]);
  const color = c.cat[habit.category];
  // A full day is a solid disc; the number on it takes whichever ink reads better, and the disc
  // moves a little lighter or darker if the category colour is a mid-tone neither ink reads on.
  const inkOnFull = inkFor(color, [c.text, c.bg]);
  const fullFill = readableFill(color, inkOnFull);
  const thisMonth = monthOf(today);
  const firstMonth = monthOf(firstDay);
  const thisYear = parseDay(today).year;
  const dayLabel = (day: string) => (parseDay(day).year === thisYear ? formatDayShort(day) : formatDayLong(day));

  return (
    <Sheet visible={visible} title={`Fix an older day · ${habit.name}`} onClose={onClose}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 12 }}>
        Tap a day to change what was logged. The 7-day strip covers the recent days; this reaches back to {formatDayShort(firstDay)}, when the habit was added.
      </Txt>
      <Row style={styles.header}>
        <IconButton Glyph={UI.Back} label="Previous month" onPress={() => setMonth((m) => shiftMonth(m, -1))} size={36} color={month > firstMonth ? c.text : c.textTertiary} disabled={month <= firstMonth} />
        <PressableScale haptic={false} onPress={() => setMonth(thisMonth)} accessibilityRole="button" accessibilityLabel={monthTitle(month)} accessibilityHint={month === thisMonth ? undefined : 'Jumps to this month'} style={{ flex: 1 }}>
          <Txt role="title2" align="center" accessibilityLiveRegion="polite">
            {monthTitle(month)}
          </Txt>
        </PressableScale>
        <IconButton Glyph={UI.Caret} label="Next month" onPress={() => setMonth((m) => shiftMonth(m, 1))} size={36} color={month < thisMonth ? c.text : c.textTertiary} disabled={month >= thisMonth} />
      </Row>
      <View style={styles.weekRow}>
        {weekdays.map((w, i) => (
          <Txt key={`${w}-${i}`} role="caption" tone="tertiary" align="center" style={styles.weekday}>
            {w}
          </Txt>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`empty-${i}`} style={styles.cell} />;
          const open = day <= today && day >= firstDay;
          const ratio = open ? (values[day] ?? 0) : 0;
          const full = ratio >= 1;
          // Part of a day is a ring (the number stays on the surface, at full contrast); a full day a solid disc.
          const ring = !full && ratio > 0 ? { borderColor: withAlpha(color, 0.35 + ratio * 0.65), borderWidth: 3 } : null;
          const isToday = day === today;
          const n = parseDay(day).day;
          const a11y = [dayLabel(day), isToday ? 'today' : '', !open ? 'not available' : ratio === 0 ? 'nothing logged' : full ? 'goal met' : `${Math.round(ratio * 100)} percent of the goal`].filter(Boolean).join(', ');
          return (
            <PressableScale key={day} haptic={false} disabled={!open} onPress={() => onPick(day)} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !open }} style={styles.cell}>
              <View style={[styles.disc, full ? { backgroundColor: fullFill } : ring, isToday && !full && !ring ? { borderColor: c.green, borderWidth: 2 } : null]}>
                <Txt role="callout" color={!open ? c.textTertiary : full ? inkOnFull : isToday ? c.green : c.text} align="center">
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
/** The grid runs into the sheet's side padding so seven columns stay ≥ 48 dp wide on a 360 dp phone. */
const BLEED = 12;

const styles = StyleSheet.create({
  header: { marginBottom: 6 },
  weekRow: { flexDirection: 'row', marginBottom: 4, marginHorizontal: -BLEED },
  weekday: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -BLEED },
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
