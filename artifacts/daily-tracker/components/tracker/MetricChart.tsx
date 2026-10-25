import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polyline, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import { formatNumber } from '@/src/domain/time/format';
import { Txt } from '../ui/Txt';

export type Range = 'D' | 'W' | 'M' | '6M' | 'Y';

export const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 'D', label: 'D' },
  { value: 'W', label: 'W' },
  { value: 'M', label: 'M' },
  { value: '6M', label: '6M' },
  { value: 'Y', label: 'Y' },
];

export interface MetricChartProps {
  values: number[];
  labels: string[];
  color: string;
  goal?: number;
  kind?: 'bars' | 'line';
  height?: number;
  unit?: string;
}

/** Bars for daily totals, a line for long-range trends; dashed gold goal line at 60%. */
export function MetricChart({ values, labels, color, goal, kind = 'bars', height = 180, unit }: MetricChartProps) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const max = Math.max(goal ?? 0, ...values, 1) * 1.08;
  const n = values.length;
  const pad = { top: 8, bottom: 4 };
  const plotH = height - pad.top - pad.bottom;
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const gap = n > 40 ? 1 : n > 14 ? 2 : 6;
  const barW = width > 0 ? Math.max(2, (width - gap * (n - 1)) / n) : 0;

  const points = values
    .map((v, i) => {
      const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
      return `${x.toFixed(1)},${y(v).toFixed(1)}`;
    })
    .join(' ');

  return (
    <View>
      <View style={styles.scale}>
        <Txt role="caption" tone="tertiary">
          {goal !== undefined ? `Goal ${formatNumber(goal)}${unit ? ` ${unit}` : ''}` : ''}
        </Txt>
        <Txt role="caption" tone="tertiary">
          {`Max ${formatNumber(Math.max(...values, 0))}${unit ? ` ${unit}` : ''}`}
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
                  const h = Math.max(2, (v / max) * plotH);
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
