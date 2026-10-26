import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { adherenceColor } from '@/src/domain/adherence/adherenceScale';
import { withAlpha } from '@/src/domain/color/oklch';
import { formatDayShort } from '@/src/domain/time/format';
import { weekdayLetters } from '@/src/domain/time/month';
import { addDays, weekStartIndex, weekStartOf } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';
import { Txt } from '../ui/Txt';

const WEEKS = 26;
const GAP = 3;
/** Row labels: every other weekday, from the week's first day (M·W·F·S for Monday weeks, S·T·T·S for Sunday weeks). */
function dayLabels(weekStart: number): string[] {
  return weekdayLetters(weekStart).map((l, i) => (i % 2 === 0 ? l : ''));
}

export interface Heatmap26wProps {
  /** day → ratio in [0, 1]; missing days render as empty. */
  values: Record<string, number>;
  today: string;
  createdDay: string;
}

/** 26 columns × 7 rows (Mon–Sun), adherence scale at 70% opacity, empty = surfaceRaised. */
export function Heatmap26w({ values, today, createdDay }: Heatmap26wProps) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const labelWidth = 16;
  const cell = width > 0 ? Math.floor((width - labelWidth - (WEEKS - 1) * GAP) / WEEKS) : 10;

  const weekStart = weekStartIndex(useTracker().state.settings.weekStart);
  const labels = useMemo(() => dayLabels(weekStart), [weekStart]);
  const weeks = useMemo(() => {
    const thisWeek = weekStartOf(today, weekStart);
    const out: string[][] = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      const start = addDays(thisWeek, -7 * w);
      out.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
    }
    return out;
  }, [today, weekStart]);

  const firstDay = weeks[0]![0]!;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // A spoken summary instead of 182 unlabeled squares: how many days were full, partial, empty,
  // and the best stretch — the same facts the colours show.
  const summary = useMemo(() => {
    let full = 0;
    let partial = 0;
    let counted = 0;
    let run = 0;
    let best = 0;
    for (const days of weeks) {
      for (const day of days) {
        if (day > today || day < createdDay) continue;
        counted += 1;
        const v = values[day] ?? 0;
        if (v >= 1) {
          full += 1;
          run += 1;
          best = Math.max(best, run);
        } else {
          run = 0;
          if (v > 0) partial += 1;
        }
      }
    }
    if (counted === 0) return 'Last 26 weeks: no days tracked yet.';
    const pct = Math.round((full / counted) * 100);
    return `Last 26 weeks: ${full} of ${counted} days complete (${pct}%), ${partial} partial, ${counted - full - partial} empty. Longest run of complete days: ${best}.`;
  }, [weeks, values, today, createdDay]);

  return (
    <View onLayout={onLayout} accessibilityRole="image" accessibilityLabel={summary}>
      <View style={{ flexDirection: 'row', gap: GAP }}>
        <View style={{ width: labelWidth, gap: GAP }}>
          {labels.map((l, i) => (
            <View key={i} style={{ height: cell, justifyContent: 'center' }}>
              <Txt role="caption" tone="tertiary" style={{ fontSize: 10, lineHeight: 12 }}>
                {l}
              </Txt>
            </View>
          ))}
        </View>
        {weeks.map((days, wi) => (
          <View key={wi} style={{ gap: GAP }}>
            {days.map((day) => {
              const future = day > today;
              const beforeStart = day < createdDay;
              const v = values[day];
              let bg: string = c.surfaceRaised;
              if (future) bg = 'transparent';
              else if (beforeStart) bg = withAlpha(c.surfaceRaised, 0.5);
              else if (v !== undefined && v > 0) bg = withAlpha(adherenceColor(v), 0.7);
              const isToday = day === today;
              const complete = !future && !beforeStart && v !== undefined && v >= 1;
              return (
                <View
                  key={day}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: Math.max(2, Math.round(cell * 0.25)),
                    backgroundColor: bg,
                    borderWidth: isToday ? 1 : 0,
                    borderColor: c.goldBright,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* Complete days carry a dot as well as the colour, so partial vs full never relies on hue alone —
                      at every phone width (a 360 dp screen gives 7 dp cells). */}
                  {complete && cell >= 5 ? <View style={{ width: Math.max(2, Math.round(cell * 0.3)), height: Math.max(2, Math.round(cell * 0.3)), borderRadius: 99, backgroundColor: withAlpha(c.text, 0.55) }} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        <Txt role="caption" tone="tertiary">
          {formatDayShort(firstDay)}
        </Txt>
        <Txt role="caption" tone="tertiary">
          {formatDayShort(today)}
        </Txt>
      </View>
      <View style={styles.legend}>
        <Txt role="caption" tone="tertiary">
          Dormant
        </Txt>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <View key={v} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: withAlpha(adherenceColor(v), 0.7) }} />
        ))}
        <Txt role="caption" tone="tertiary">
          Flow
        </Txt>
        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: withAlpha(adherenceColor(1), 0.7), alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
          <View style={{ width: 4, height: 4, borderRadius: 99, backgroundColor: withAlpha(c.text, 0.55) }} />
        </View>
        <Txt role="caption" tone="tertiary">
          Complete
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingLeft: 16,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
});
