import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Divider, Row, Segmented } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { APP_LOCK_DELAYS } from '@/src/domain/models';
import { lockCapability, type LockCapability } from '@/src/services/appLock';
import { useTracker } from '@/src/state/TrackerProvider';

const DELAY_LABELS: Record<(typeof APP_LOCK_DELAYS)[number], string> = { 0: 'Right away', 1: '1 min', 5: '5 min', 15: '15 min' };

/** App lock switch + re-lock delay. Disabled, with the reason, where the phone cannot authenticate. */
export function AppLockCard() {
  const c = useColors();
  const { state, actions } = useTracker();
  const lock = state.settings.appLock;
  const [capability, setCapability] = useState<LockCapability | null>(null);

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
          <Txt role="title2">App lock</Txt>
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
