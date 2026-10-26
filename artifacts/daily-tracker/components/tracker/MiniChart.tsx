import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';

export interface MiniChartProps {
  values: number[];
  color: string;
  goal?: number;
  kind?: 'bars' | 'line';
  height?: number;
  /** Index of the highlighted bar (default: last). */
  emphasis?: number;
  /** Lower edge of the scale for line charts (weight, heart rate), so a trend is not flattened against zero. */
  baseline?: number;
}

/** The 56 dp chart in Apple-Health-style summary cards. */
export function MiniChart({ values, color, goal, kind = 'bars', height = 56, emphasis, baseline }: MiniChartProps) {
  const c = useColors();
  const max = Math.max(goal ?? 0, ...values, 1);
  const last = values.length - 1;
  const hi = emphasis ?? last;

  if (kind === 'line') {
    return <Sparkline values={values} color={color} goal={goal} height={height} baseline={baseline} />;
  }

  return (
    <View style={[styles.bars, { height }]}>
      {goal !== undefined ? (
        <View
          pointerEvents="none"
          style={[styles.goal, { bottom: (goal / max) * height, borderColor: withAlpha(c.gold, 0.6) }]}
        />
      ) : null}
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * height);
        return (
          <View key={i} style={styles.barSlot}>
            <View
              style={{
                height: h,
                borderRadius: 3,
                backgroundColor: i === hi ? color : withAlpha(color, 0.45),
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function Sparkline({ values, color, goal, height, baseline }: { values: number[]; color: string; goal?: number; height: number; baseline?: number }) {
  const c = useColors();
  const width = 120;
  // Gaps (no reading that day) are skipped rather than drawn as zero.
  const present = values.filter((v) => v > 0);
  const base = baseline ?? 0;
  const max = Math.max(goal ?? 0, ...present, base + 1);
  const span = Math.max(max - base, 1);
  const n = Math.max(values.length, 2);
  const yOf = (v: number) => height - 3 - ((v - base) / span) * (height - 6);
  const points = values
    .map((v, i) => (v > 0 ? `${((i / (n - 1)) * width).toFixed(1)},${yOf(v).toFixed(1)}` : null))
    .filter((p): p is string => p !== null)
    .join(' ');
  return (
    <View style={{ height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {goal !== undefined ? (
          <Line x1={0} x2={width} y1={yOf(goal)} y2={yOf(goal)} stroke={withAlpha(c.gold, 0.6)} strokeDasharray="4 4" strokeWidth={1} />
        ) : null}
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barSlot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  goal: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
});
