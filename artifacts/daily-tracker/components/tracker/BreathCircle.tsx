import React, { useEffect, useRef } from 'react';
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

/** Where the circle is at the start and end of each phase, and how it moves between them. */
const PHASE_MOTION = [
  { from: 0.8, to: 1.2, easing: Easing.inOut(Easing.quad) },
  { from: 1.2, to: 1.32, easing: Easing.out(Easing.quad) },
  { from: 1.32, to: 0.8, easing: Easing.inOut(Easing.cubic) },
] as const;

const fullCycle = () =>
  withSequence(
    withTiming(PHASE_MOTION[0].to, { duration: BREATH_PHASES[0].ms, easing: PHASE_MOTION[0].easing }),
    withTiming(PHASE_MOTION[1].to, { duration: BREATH_PHASES[1].ms, easing: PHASE_MOTION[1].easing }),
    withTiming(PHASE_MOTION[2].to, { duration: BREATH_PHASES[2].ms, easing: PHASE_MOTION[2].easing }),
  );

/**
 * Circle that scales with the breath; violet → green glow. `elapsedMs` is the session clock the
 * phase label follows: a resume after a pause picks the motion up mid-phase, so "Long exhale" on
 * the label is a shrinking circle, not a fresh inhale.
 */
export function BreathCircle({ running, elapsedMs = 0, size = 220 }: { running: boolean; elapsedMs?: number; size?: number }) {
  const c = useColors();
  const scale = useSharedValue(0.8);
  // Read when the clock starts, not on every tick: the animation runs on its own after that.
  const elapsedRef = useRef(elapsedMs);
  elapsedRef.current = elapsedMs;

  useEffect(() => {
    if (running) {
      let t = elapsedRef.current % BREATH_CYCLE_MS;
      let phase = 0;
      while (phase < BREATH_PHASES.length - 1 && t >= BREATH_PHASES[phase]!.ms) {
        t -= BREATH_PHASES[phase]!.ms;
        phase++;
      }
      const motion = PHASE_MOTION[phase]!;
      const ms = BREATH_PHASES[phase]!.ms;
      // Jump to where this phase is right now, finish the rest of the cycle, then loop whole cycles.
      scale.value = motion.from + (motion.to - motion.from) * Math.min(1, t / ms);
      const rest = [withTiming(motion.to, { duration: Math.max(1, ms - t), easing: motion.easing })];
      for (let i = phase + 1; i < BREATH_PHASES.length; i++) rest.push(withTiming(PHASE_MOTION[i]!.to, { duration: BREATH_PHASES[i]!.ms, easing: PHASE_MOTION[i]!.easing }));
      scale.value = withSequence(...rest, withRepeat(fullCycle(), -1, false));
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
