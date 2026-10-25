import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { adherenceColor } from '@/src/domain/adherence/adherenceScale';
import { withAlpha } from '@/src/domain/color/oklch';
import { formatDayShort } from '@/src/domain/time/format';
import { addDays, weekStartOf } from '@/src/domain/time/trackingDay';
import { Txt } from '../ui/Txt';

const WEEKS = 26;
const GAP = 3;
const DAY_LABELS = ['M', '', 'W', '', 'F', '', 'S'];

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

  const weeks = useMemo(() => {
    const thisWeek = weekStartOf(today);
    const out: string[][] = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      const start = addDays(thisWeek, -7 * w);
      out.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
    }
    return out;
  }, [today]);

  const firstDay = weeks[0]![0]!;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} accessibilityLabel="26-week adherence heatmap">
      <View style={{ flexDirection: 'row', gap: GAP }}>
        <View style={{ width: labelWidth, gap: GAP }}>
          {DAY_LABELS.map((l, i) => (
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
                  }}
                />
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
    gap: 4,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
});
