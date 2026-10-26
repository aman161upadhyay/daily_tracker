import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { SPACE } from '@/constants/typography';
import { useColors, useScheme } from '@/hooks/useColors';

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
  const light = useScheme() === 'light';
  const base: ViewStyle = {
    backgroundColor: raised ? c.surfaceRaised : c.surface,
    borderRadius: c.radius,
    borderWidth: 1,
    borderColor: featured ? c.goldFrame : c.hairline,
    // Dark expresses elevation through surfaceRaised; light gets the soft 0 1 2 shadow from the design system.
    ...(light && !raised
      ? Platform.OS === 'web'
        ? ({ boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)' } as ViewStyle)
        : { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
      : null),
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
