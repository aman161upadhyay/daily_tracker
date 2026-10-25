import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { backgroundColor: c.surfaceRaised, borderColor: c.hairline, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.grabber, { backgroundColor: c.hairline }]} />
          <View style={styles.header}>
            <Txt role="title1" style={{ flex: 1 }}>
              {title}
            </Txt>
            <IconButton Glyph={UI.Close} label="Close" onPress={onClose} size={36} color={c.textSecondary} haptic={false} />
          </View>
          <ScrollView bounces={false} contentContainerStyle={{ paddingHorizontal: SPACE.screen, paddingBottom: 8 }} style={{ maxHeight: 560 }}>
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
  },
});
