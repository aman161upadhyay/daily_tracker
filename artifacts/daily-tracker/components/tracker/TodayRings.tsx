import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const STROKE = 12;
const GAP = 3;

export interface RingValues {
  hydration: number;
  movement: number;
  mind: number;
}

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function Ring({ r, progress, color, size, animate }: { r: number; progress: number; color: string; size: number; animate: boolean }) {
  const circumference = 2 * Math.PI * r;
  const p = useSharedValue(animate ? 0 : progress);

  useEffect(() => {
    p.value = animate ? withTiming(progress, { duration: 600, easing: Easing.out(Easing.cubic) }) : progress;
  }, [progress, animate, p]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value),
  }));

  const center = size / 2;
  const common = { cx: center, cy: center, r, strokeWidth: STROKE, fill: 'none' as const };

  return (
    <G transform={`rotate(-90 ${center} ${center})`}>
      <Circle {...common} stroke={withAlpha(color, 0.15)} />
      {Platform.OS === 'web' ? (
        <Circle {...common} stroke={color} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - progress)} />
      ) : (
        <AnimatedCircle {...common} stroke={color} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} animatedProps={animatedProps} />
      )}
    </G>
  );
}

/**
 * Apple-Health-style concentric rings: Hydration (outer), Movement, Mind (inner).
 * Fills animate once when the component mounts (the app's one entry animation).
 */
export function TodayRings({ values, size = 160, children }: { values: RingValues; size?: number; children?: React.ReactNode }) {
  const c = useColors();
  const r1 = (size - STROKE) / 2;
  const r2 = r1 - STROKE - GAP;
  const r3 = r2 - STROKE - GAP;
  const reduceMotion = useReducedMotion();
  const animate = Platform.OS !== 'web' && !reduceMotion;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`Rings: hydration ${Math.round(values.hydration * 100)} percent, movement ${Math.round(values.movement * 100)} percent, mind ${Math.round(values.mind * 100)} percent`}>
      <Svg width={size} height={size}>
        <Ring r={r1} progress={clamp(values.hydration)} color={c.cat.hydration} size={size} animate={animate} />
        <Ring r={r2} progress={clamp(values.movement)} color={c.cat.movement} size={size} animate={animate} />
        <Ring r={r3} progress={clamp(values.mind)} color={c.cat.mind} size={size} animate={animate} />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
