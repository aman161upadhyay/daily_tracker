import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import { displayPhase, PHASE_LABELS, phaseQualifier, type CyclePhase, type CycleTimeline } from '@/src/domain/cycle/timeline';
import { addDays, dayDiff } from '@/src/domain/time/trackingDay';
import { phaseColor } from './phaseColors';

export interface PhaseRingProps {
  timeline: CycleTimeline;
  today: string;
  birthControl: boolean;
  size?: number;
}

interface Segment {
  phase: CyclePhase;
  from: number;
  to: number;
}

/**
 * The current cycle as a ring: one arc per phase, proportional to its days,
 * a marker on today. Centre: cycle day and phase name.
 */
export function PhaseRing({ timeline, today, birthControl, size = 216 }: PhaseRingProps) {
  const c = useColors();
  const palette = { cycle: c.cat.cycle, green: c.green, violet: c.violetSoft, gold: c.goldBright, textTertiary: c.textTertiary };
  const prediction = timeline.prediction;

  const model = useMemo(() => {
    if (!prediction) return null;
    const start = prediction.lastStart;
    const late = prediction.lateDays > 0;
    const end = late ? today : addDays(prediction.nextStart, -1);
    const total = Math.max(1, dayDiff(start, end) + 1);
    const segments: Segment[] = [];
    for (let i = 0; i < total; i++) {
      const day = addDays(start, i);
      const info = timeline.infoOn(day);
      const phase = info ? displayPhase(info.phase, birthControl) : 'follicular';
      const last = segments[segments.length - 1];
      if (last && last.phase === phase) last.to = i;
      else segments.push({ phase, from: i, to: i });
    }
    const todayIndex = Math.min(total - 1, Math.max(0, dayDiff(start, today)));
    return { total, segments, todayIndex, late };
  }, [prediction, timeline, today, birthControl]);

  const todayInfo = timeline.infoOn(today);
  const stroke = 16;
  const r = (size - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const center = size / 2;
  const gapDeg = 2.5;

  // Only logged bleeding is observed; every other phase says it was calculated.
  const word = phaseQualifier(todayInfo, today, today);
  const label = todayInfo ? `${PHASE_LABELS[displayPhase(todayInfo.phase, birthControl)]}${word ? ` (${word})` : ''}` : 'No data';
  const dayText = todayInfo ? `Day ${todayInfo.cycleDay}` : '—';

  return (
    <View style={[styles.root, { width: size, height: size }]} accessibilityRole="image" accessibilityLabel={`${dayText}, ${label}`}>
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${center} ${center})`}>
          <Circle cx={center} cy={center} r={r} stroke={withAlpha(c.text, 0.07)} strokeWidth={stroke} fill="none" />
          {model
            ? model.segments.map((seg) => {
                const share = (seg.to - seg.from + 1) / model.total;
                const offset = seg.from / model.total;
                const gap = model.segments.length > 1 ? (gapDeg / 360) * circumference : 0;
                const length = Math.max(0, share * circumference - gap);
                const color = phaseColor(seg.phase, palette);
                const predictedShare = seg.from > model.todayIndex;
                return (
                  <Circle
                    key={`${seg.phase}-${seg.from}`}
                    cx={center}
                    cy={center}
                    r={r}
                    stroke={predictedShare ? withAlpha(color, 0.35) : color}
                    strokeWidth={stroke}
                    strokeLinecap="butt"
                    strokeDasharray={`${length} ${circumference}`}
                    strokeDashoffset={-offset * circumference - gap / 2}
                    fill="none"
                  />
                );
              })
            : null}
        </G>
        {model ? <TodayMarker center={center} r={r} angle={((model.todayIndex + 0.5) / model.total) * 360} color={c.text} /> : null}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Txt role="display" align="center">
          {dayText}
        </Txt>
        <Txt role="callout" tone="secondary" align="center">
          {model?.late ? `${label} · ${prediction!.lateDays} ${prediction!.lateDays === 1 ? 'day' : 'days'} late` : label}
        </Txt>
      </View>
    </View>
  );
}

function TodayMarker({ center, r, angle, color }: { center: number; r: number; angle: number; color: string }) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x = center + r * Math.cos(rad);
  const y = center + r * Math.sin(rad);
  return (
    <>
      <Circle cx={x} cy={y} r={7} fill={color} />
      <Circle cx={x} cy={y} r={3.5} fill={withAlpha(color, 0.25)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
});
