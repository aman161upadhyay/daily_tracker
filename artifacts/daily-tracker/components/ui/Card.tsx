import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { SPACE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export interface CardProps extends ViewProps {
  /** Gold frame = "this matters now" (rings card, live nudge, a habit in flow). */
  featured?: boolean;
  /** Violet outer glow used together with `featured` for the flow state. */
  glow?: boolean;
  raised?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ featured, glow, raised, padded = true, style, children, ...rest }: CardProps) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: raised ? c.surfaceRaised : c.surface,
    borderRadius: c.radius,
    borderWidth: 1,
    borderColor: featured ? c.goldFrame : c.hairline,
  };
  const glowStyle: ViewStyle | undefined = glow
    ? Platform.OS === 'web'
      ? ({ boxShadow: `0 0 12px ${c.flowGlow}` } as ViewStyle)
      : { shadowColor: c.violet, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 0 }
    : undefined;

  return (
    <View {...rest} style={[base, glowStyle, style]}>
      {featured ? <View pointerEvents="none" style={[styles.inner, { borderColor: c.goldFrameInner, borderRadius: c.radius - 1 }]} /> : null}
      <View style={padded ? styles.pad : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    margin: 1,
  },
  pad: {
    padding: SPACE.cardPad,
  },
});
