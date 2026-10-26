import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI } from '@/components/ui/icons';
import { IconTile, PillButton } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { authenticate, lockCapability } from '@/src/services/appLock';
import { useTracker } from '@/src/state/TrackerProvider';

/**
 * Covers the app with a lock screen on a cold start and after it has been in
 * the background for `settings.appLock.afterMin` minutes. The gate is purely
 * visual: widgets and notification buttons keep logging while the app is
 * locked (one-tap water is the point of the widget). A phone without any
 * screen lock cannot authenticate, so the gate steps aside instead of
 * trapping the user — the Settings row explains why the lock is off.
 */
export function AppLockGate() {
  const { state } = useTracker();
  const { enabled, afterMin } = state.settings.appLock;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [locked, setLocked] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    setBusy(true);
    try {
      const capability = await lockCapability();
      if (!capability.available) {
        setLocked(false);
        return;
      }
      if (await authenticate()) setLocked(false);
    } finally {
      authenticating.current = false;
      setBusy(false);
    }
  }, []);

  // Re-lock after the configured time away; ignore the transitions the biometric prompt itself causes.
  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    const onChange = (next: AppStateStatus) => {
      if (authenticating.current) return;
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away >= afterMin * 60_000) setLocked(true);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [enabled, afterMin]);

  // Prompt as soon as the lock screen appears.
  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  if (!locked) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} accessibilityViewIsModal>
        <View style={styles.body}>
          <IconTile Glyph={UI.Lock} color={c.green} size={64} />
          <Txt role="largeTitle" align="center" style={{ marginTop: 20 }}>
            Daily Tracker
          </Txt>
          <Txt role="body" tone="secondary" align="center" style={{ marginTop: 6 }}>
            Locked. Widgets and reminders keep working.
          </Txt>
        </View>
        <PillButton label={busy ? 'Unlocking…' : 'Unlock'} Leading={UI.Fingerprint} onPress={() => void unlock()} disabled={busy} style={{ alignSelf: 'stretch', marginHorizontal: 32 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'space-between' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
});
