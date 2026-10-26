import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polyline, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import { formatNumber } from '@/src/domain/time/format';
import { Txt } from '../ui/Txt';

export type Range = 'D' | 'W' | 'M' | '6M' | 'Y';

/** Labels say what the chart shows: 'D' is the last 7 days, 'W' the last 2 weeks, 'M' the last 30 days. */
export const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 'D', label: '7D' },
  { value: 'W', label: '2W' },
  { value: 'M', label: '1M' },
  { value: '6M', label: '6M' },
  { value: 'Y', label: '1Y' },
];

export interface MetricChartProps {
  values: number[];
  labels: string[];
  color: string;
  goal?: number;
  kind?: 'bars' | 'line';
  height?: number;
  unit?: string;
  /** Scale labels ("Max 7h 20m" instead of "Max 440 min"). */
  format?: (v: number) => string;
  /** Lower edge of the scale for line charts (weight, heart rate); zero values are gaps, not points. */
  baseline?: number;
}

/** Bars for daily totals, a line for long-range trends; dashed gold goal line at 60%. */
export function MetricChart({ values, labels, color, goal, kind = 'bars', height = 180, unit, format, baseline }: MetricChartProps) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const present = values.filter((v) => v > 0);
  const base = baseline ?? 0;
  const top = Math.max(goal ?? 0, ...present, base + 1);
  const max = base + (top - base) * 1.08;
  const n = values.length;
  const pad = { top: 8, bottom: 4 };
  const plotH = height - pad.top - pad.bottom;
  const y = (v: number) => pad.top + plotH - ((v - base) / (max - base)) * plotH;
  const fmt = (v: number) => (format ? format(v) : `${formatNumber(v)}${unit ? ` ${unit}` : ''}`);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Screen readers get the numbers the picture shows: the SVG itself is silent.
  const latest = values.length > 0 ? values[values.length - 1]! : 0;
  const summary =
    present.length === 0
      ? `Chart: nothing recorded in this range${labels.length > 0 ? `, ${labels[0]} to ${labels[labels.length - 1]}` : ''}.`
      : `Chart, ${labels.length > 0 ? `${labels[0]} to ${labels[labels.length - 1]}` : `${n} ${kind === 'line' ? 'points' : 'bars'}`}: latest ${fmt(latest)}, highest ${fmt(Math.max(...present))}, ${present.length} of ${n} ${kind === 'line' ? 'points' : 'days'} recorded${goal !== undefined ? `, goal ${fmt(goal)}` : ''}.`;
  const gap = n > 40 ? 1 : n > 14 ? 2 : 6;
  const barW = width > 0 ? Math.max(2, (width - gap * (n - 1)) / n) : 0;

  const points = values
    .map((v, i) => {
      if (kind === 'line' && v <= 0) return null;
      const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
      return `${x.toFixed(1)},${y(v).toFixed(1)}`;
    })
    .filter((p): p is string => p !== null)
    .join(' ');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={styles.scale}>
        <Txt role="caption" tone="tertiary">
          {goal !== undefined ? `Goal ${fmt(goal)}` : baseline !== undefined && present.length > 0 ? `Min ${fmt(Math.min(...present))}` : ''}
        </Txt>
        <Txt role="caption" tone="tertiary">
          {`Max ${fmt(Math.max(...values, 0))}`}
        </Txt>
      </View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={width} y1={pad.top + plotH * f} y2={pad.top + plotH * f} stroke={c.hairline} strokeWidth={1} />
            ))}
            {kind === 'bars'
              ? values.map((v, i) => {
                  const h = Math.max(2, ((v - base) / (max - base)) * plotH);
                  return (
                    <Rect
                      key={i}
                      x={i * (barW + gap)}
                      y={pad.top + plotH - h}
                      width={barW}
                      height={h}
                      rx={Math.min(4, barW / 2)}
                      fill={i === n - 1 ? color : withAlpha(color, 0.55)}
                    />
                  );
                })
              : <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
            {goal !== undefined ? (
              <Line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke={withAlpha(c.gold, 0.6)} strokeWidth={1.5} strokeDasharray="5 4" />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axis}>
        {labels.map((l, i) => (
          <Txt key={i} role="caption" tone="tertiary">
            {l}
          </Txt>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
});
