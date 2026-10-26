import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Divider, PillButton, Row, Segmented } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { APP_LOCK_DELAYS } from '@/src/domain/models';
import { lockCapability, setScreenProtection, type LockCapability } from '@/src/services/appLock';
import { setProtectionStatus, useProtectionStatus } from '@/src/services/protectionState';
import { useTracker } from '@/src/state/TrackerProvider';

const DELAY_LABELS: Record<(typeof APP_LOCK_DELAYS)[number], string> = { 0: 'Right away', 1: '1 min', 5: '5 min', 15: '15 min' };

/** App lock switch + re-lock delay. Disabled, with the reason, where the phone cannot authenticate. */
export function AppLockCard() {
  const c = useColors();
  const { state, actions } = useTracker();
  const lock = state.settings.appLock;
  const [capability, setCapability] = useState<LockCapability | null>(null);
  const protection = useProtectionStatus();
  const protectionFailed = lock.enabled && protection !== null && protection.enabled && !protection.ok;
  const retryProtection = () => {
    setScreenProtection(true).then((r) => setProtectionStatus({ enabled: true, ...r }));
  };

  useEffect(() => {
    let alive = true;
    lockCapability().then((cap) => alive && setCapability(cap));
    return () => {
      alive = false;
    };
  }, []);

  const available = capability?.available ?? false;
  const hint = !capability
    ? 'Checking the screen lock…'
    : !available
      ? capability.reason
      : capability.biometric
        ? 'Fingerprint or face, with the screen-lock PIN as fallback. Widgets and notification buttons keep working while locked.'
        : 'Uses the phone’s PIN or pattern. Widgets and notification buttons keep working while locked.';

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Txt role="title2" heading>App lock</Txt>
          <Txt role="footnote" tone="secondary">
            {hint}
          </Txt>
        </View>
        <Switch
          value={lock.enabled && available}
          disabled={!available}
          onValueChange={(enabled) => actions.updateSettings({ appLock: { ...lock, enabled } })}
          trackColor={{ false: c.hairline, true: c.green }}
          thumbColor={c.text}
          accessibilityLabel="App lock"
        />
      </Row>
      {protectionFailed ? (
        <>
          <Divider />
          <Row gap={8} style={{ paddingTop: 12, alignItems: 'center' }}>
            <Txt role="footnote" tone="gold" style={{ flex: 1 }}>
              {`Screenshots and the recent-apps preview are not blocked: the phone refused (${protection.reason ?? 'no reason given'}). The lock itself still works.`}
            </Txt>
            <PillButton label="Retry" kind="ghost" compact onPress={retryProtection} />
          </Row>
        </>
      ) : null}
      {lock.enabled && available ? (
        <>
          <Divider />
          <View style={{ paddingTop: 12 }}>
            <Txt role="footnote" tone="secondary" style={{ marginBottom: 8 }}>
              Lock again after leaving the app for
            </Txt>
            <Segmented
              options={APP_LOCK_DELAYS.map((m) => ({ value: String(m), label: DELAY_LABELS[m] }))}
              value={String(lock.afterMin)}
              onChange={(v) => actions.updateSettings({ appLock: { ...lock, afterMin: Number(v) } })}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}
