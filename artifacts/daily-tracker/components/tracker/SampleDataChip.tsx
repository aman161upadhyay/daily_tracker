import React from 'react';
import { Alert, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTracker } from '@/src/state/TrackerProvider';
import { Chip, Row } from '../ui/primitives';

/**
 * "Sample data · Start fresh" shown at the top of every tab while the demo
 * history is loaded, so the user is never looking at invented numbers without
 * being told — wherever they happen to be.
 */
export function SampleDataChip() {
  const c = useColors();
  const { state, actions } = useTracker();
  if (!state.settings.sampleData) return null;

  const confirmFresh = () => {
    const go = () => actions.startFresh();
    if (Platform.OS === 'web') {
      go();
      return;
    }
    Alert.alert('Start fresh?', 'This removes the sample history and keeps your settings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start fresh', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <Row gap={8} style={{ marginBottom: 4 }}>
      <Chip label="Sample data" color={c.gold} selected />
      <Chip label="Start fresh" onPress={confirmFresh} />
    </Row>
  );
}
