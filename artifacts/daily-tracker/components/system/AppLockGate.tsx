import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI } from '@/components/ui/icons';
import { IconTile, PillButton } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { authenticate, lockCapability, setScreenProtection } from '@/src/services/appLock';
import { useTracker } from '@/src/state/TrackerProvider';

/**
 * Covers the app with a lock screen on a cold start and after it has been in
 * the background for `settings.appLock.afterMin` minutes ("immediately" locks
 * the moment the app leaves the screen). The gate is purely visual: widgets
 * and notification buttons keep logging while the app is locked (one-tap
 * water is the point of the widget).
 *
 * A phone with no screen lock at all cannot authenticate, so the gate steps
 * aside instead of trapping the user — the Settings row explains why the lock
 * is off. A phone whose lock status merely could not be read stays locked and
 * offers a retry: "could not check" is not "no lock".
 *
 * While the lock is on, the window is also marked secure (no screenshots, a
 * blank recent-apps card), see services/appLock.
 */
export function AppLockGate() {
  const { state } = useTracker();
  const { enabled, afterMin } = state.settings.appLock;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [locked, setLocked] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    setBusy(true);
    try {
      const capability = await lockCapability();
      if (capability.status === 'none') {
        setLocked(false);
        return;
      }
      if (capability.status === 'error') {
        setProblem(capability.reason ?? 'The screen lock could not be checked.');
        return;
      }
      setProblem(null);
      if (await authenticate()) setLocked(false);
    } finally {
      authenticating.current = false;
      setBusy(false);
    }
  }, []);

  // Screenshot / app-switcher protection follows the setting.
  useEffect(() => {
    void setScreenProtection(enabled);
  }, [enabled]);

  // The lock turning on while the app is open locks right away: a restored backup that had it on
  // (the welcome screen's Restore) must not show its records before the first check, and the
  // settings switch confirms the phone's lock works the moment it is turned on. Without a screen
  // lock on the phone `unlock` lets the screen through at once.
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    if (enabled && !wasEnabled.current) setLocked(true);
    wasEnabled.current = enabled;
  }, [enabled]);

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
        if (afterMin === 0) setLocked(true);
      } else if (next === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away >= afterMin * 60_000) setLocked(true);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [enabled, afterMin]);

  // Prompt as soon as the lock screen appears. Not again on every foreground: the system prompt
  // itself toggles the app state, and a cancelled prompt must not re-open immediately.
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
          {problem ? (
            <Txt role="footnote" tone="danger" align="center" style={{ marginTop: 16 }}>
              {`Could not check the phone’s screen lock: ${problem}`}
            </Txt>
          ) : null}
        </View>
        <PillButton label={busy ? 'Unlocking…' : problem ? 'Try again' : 'Unlock'} Leading={UI.Fingerprint} onPress={() => void unlock()} disabled={busy} style={{ alignSelf: 'stretch', marginHorizontal: 32 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'space-between' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
});
