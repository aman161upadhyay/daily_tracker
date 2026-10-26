import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useAppLocked } from '@/src/services/lockState';
import { UI } from './icons';
import { IconButton } from './primitives';
import { Txt } from './Txt';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Bottom sheet on a RN Modal: scrim, raised surface, 20 dp top radius, close button. */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // "Remove animations" in Android's accessibility settings also stops the slide-up.
  const reduceMotion = useReducedMotion();
  // The sheet never grows past the window: on a short phone (or at a large font size) a fixed body
  // height pushed the title and the close button above the top edge. The body is what shrinks;
  // the grabber and the header keep their size, so Close stays reachable.
  const maxHeight = Math.max(240, windowHeight - insets.top - 24);
  // Never above the app-lock gate: a Modal presented while the gate's own Modal is up stacks on
  // top of it on Android (a deep link that opens a sheet would show the lock what it hides). The
  // sheet waits, and appears once the gate is down.
  const locked = useAppLocked();
  return (
    <Modal visible={visible && !locked} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { backgroundColor: c.surfaceRaised, borderColor: c.hairline, paddingBottom: Math.max(insets.bottom, 16), maxHeight }]}>
          <View style={[styles.grabber, { backgroundColor: c.hairline }]} />
          <View style={styles.header}>
            <Txt role="title1" style={{ flex: 1 }}>
              {title}
            </Txt>
            <IconButton Glyph={UI.Close} label="Close" onPress={onClose} size={36} color={c.textSecondary} haptic={false} />
          </View>
          {/* A tap on Set/Log while the keyboard is up acts at once instead of only closing the keyboard. */}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: SPACE.screen, paddingBottom: 8 }} style={styles.body}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 8,
  },
  grabber: {
    flexShrink: 0,
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.screen,
    paddingBottom: 8,
    flexShrink: 0,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
});
