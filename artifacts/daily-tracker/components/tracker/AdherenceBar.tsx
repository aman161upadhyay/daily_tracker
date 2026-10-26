import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { ADHERENCE_LUT_INPUT, ADHERENCE_LUT_OUTPUT, clamp01, FLOW_GRADIENT, FLOW_THRESHOLD } from '@/src/domain/adherence/adherenceScale';

export interface AdherenceBarProps {
  /** Adherence in [0, 1]: drives the color. */
  adherence: number;
  /** Fill fraction in [0, 1] (default: adherence). */
  fill?: number;
  height?: number;
}

/**
 * Thin bar whose width and color follow the adherence scale, animating over
 * 400 ms when a tick changes the value. In flow it becomes the green → violet
 * gradient.
 */
export function AdherenceBar({ adherence, fill, height = 4 }: AdherenceBarProps) {
  const c = useColors();
  const a = clamp01(adherence);
  const f = clamp01(fill ?? adherence);
  const flow = a >= FLOW_THRESHOLD;

  const reduceMotion = useReducedMotion();
  const width = useSharedValue(f);
  const tone = useSharedValue(a);
  useEffect(() => {
    width.value = reduceMotion ? f : withTiming(f, { duration: 400 });
    tone.value = reduceMotion ? a : withTiming(a, { duration: 400 });
  }, [a, f, width, tone, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    width: `${Math.max(2, width.value * 100)}%`,
    backgroundColor: interpolateColor(tone.value, ADHERENCE_LUT_INPUT, ADHERENCE_LUT_OUTPUT),
  }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: c.surfaceRaised }]}>
      <Animated.View style={[styles.fill, { height, borderRadius: height / 2 }, style]}>
        {flow ? <LinearGradient colors={FLOW_GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    overflow: 'hidden',
  },
});
