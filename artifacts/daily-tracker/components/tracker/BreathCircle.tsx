import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';

/** Cyclic sighing: inhale, a second short inhale, then a long exhale (≈ 9.5 s per cycle). */
export const BREATH_PHASES = [
  { label: 'Breathe in', ms: 2500 },
  { label: 'A little more', ms: 1000 },
  { label: 'Long exhale', ms: 6000 },
] as const;

export const BREATH_CYCLE_MS = BREATH_PHASES.reduce((a, p) => a + p.ms, 0);

export function phaseAt(elapsedMs: number): string {
  let t = elapsedMs % BREATH_CYCLE_MS;
  for (const p of BREATH_PHASES) {
    if (t < p.ms) return p.label;
    t -= p.ms;
  }
  return BREATH_PHASES[0].label;
}

/** Circle that scales with the breath; violet → green glow. */
export function BreathCircle({ running, size = 220 }: { running: boolean; size?: number }) {
  const c = useColors();
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (running) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: BREATH_PHASES[0].ms, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.32, { duration: BREATH_PHASES[1].ms, easing: Easing.out(Easing.quad) }),
          withTiming(0.8, { duration: BREATH_PHASES[2].ms, easing: Easing.inOut(Easing.cubic) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(0.8, { duration: 600 });
    }
  }, [running, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inner = size * 0.62;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={running ? 'Breathing guide running' : 'Breathing guide paused'}>
      <View style={[styles.halo, { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(c.violet, 0.08) }]} />
      <Animated.View style={[{ width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden' }, style]}>
        <LinearGradient colors={[c.violet, c.green]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
  },
});
