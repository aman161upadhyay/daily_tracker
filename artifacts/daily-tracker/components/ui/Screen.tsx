import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

export interface ScreenProps {
  children: React.ReactNode;
  /** Scrolling screens (default). */
  scroll?: boolean;
  /** Add top inset (tab screens without a native header). */
  topInset?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll = true, topInset = true, contentStyle }: ScreenProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: topInset ? insets.top + 8 : 16,
    paddingBottom: insets.bottom + 32,
    paddingHorizontal: SPACE.screen,
  };
  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: c.bg }, padding, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView style={[styles.flex, { backgroundColor: c.bg }]} contentContainerStyle={[padding, styles.content, contentStyle]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

/** Apple-Health large title with a date line and trailing actions. */
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Txt role="footnote" tone="secondary">
            {subtitle}
          </Txt>
        ) : null}
        <Txt role="largeTitle">{title}</Txt>
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

/** Round gold-ringed avatar with the user's initial; opens Settings. */
export function Avatar({ name, onPress }: { name: string; onPress: () => void }) {
  const c = useColors();
  const initial = (name.trim()[0] ?? 'A').toUpperCase();
  return (
    <PressableScale onPress={onPress} haptic={false} accessibilityRole="button" accessibilityLabel="Settings" style={[styles.avatar, { borderColor: c.gold, backgroundColor: c.surfaceRaised }]}>
      <Txt role="title2" tone="gold">
        {initial}
      </Txt>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: SPACE.cardGap },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
