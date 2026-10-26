import React, { useCallback } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Light impact on press (default true). Navigation presses should pass false. */
  haptic?: boolean;
  scaleTo?: number;
}

/** Pressable with the 0.96 press-scale and optional light haptic. */
export function PressableScale({ style, haptic = true, scaleTo = 0.96, onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      if (!reduceMotion) scale.value = withTiming(scaleTo, { duration: 90 });
      onPressIn?.(e);
    },
    [onPressIn, reduceMotion, scale, scaleTo],
  );
  const handleOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      if (!reduceMotion) scale.value = withTiming(1, { duration: 160 });
      onPressOut?.(e);
    },
    [onPressOut, reduceMotion, scale],
  );
  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (e) => {
      if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress?.(e);
    },
    [haptic, onPress],
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={handlePress}
      style={[animated, style, disabled ? { opacity: 0.5 } : null]}
    />
  );
}
