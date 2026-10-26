import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { describeLastSync } from '@/components/body/ConnectionCard';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconTile, PillButton, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { useHealthConnect } from '@/hooks/useHealthConnect';
import { useTracker } from '@/src/state/TrackerProvider';

interface Props {
  confirm: (title: string, message: string, label: string, run: () => void) => void;
}

/** Settings → Connections → Health Connect: status, connect / pause, and the way out (remove imported data). */
export function HealthConnectCard({ confirm }: Props) {
  const c = useColors();
  const router = useRouter();
  const { state, nowMs, zone } = useTracker();
  const hc = useHealthConnect();
  const b = state.body;
  const imported = b.steps.length + b.sleep.length + b.heart.length + b.weight.length + b.workouts.length;
  const autoEntries = state.entries.filter((e) => e.source === 'AUTO_HC').length + state.water.filter((w) => w.source === 'AUTO_HC').length;

  let status: string;
  if (!hc.supported) status = 'Needs the installed Android build';
  else if (hc.status === 'checking') status = 'Checking…';
  else if (hc.status === 'not-installed') status = 'Health Connect is not installed';
  else if (hc.status === 'update-required') status = 'Health Connect needs an update';
  else if (hc.connected) status = `Connected · ${hc.granted.length} of 7 data types · ${describeLastSync(hc.lastSyncAt, nowMs, zone)}`;
  else if (hc.enabled) status = 'Connected, but no permissions are granted';
  else status = 'Not connected';

  return (
    <Card>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <IconTile Glyph={UI.Connect} color={c.cat.body} size={40} />
        <View style={{ flex: 1 }}>
          <Txt role="title2">Health Connect</Txt>
          <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
            {status}
          </Txt>
          {hc.lastError ? (
            <Txt role="footnote" color={c.danger} style={{ marginTop: 4 }}>
              {hc.lastError}
            </Txt>
          ) : null}
        </View>
      </Row>
      {hc.supported && hc.status === 'available' ? (
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {hc.connected ? (
            <>
              <PillButton label={hc.busy ? 'Syncing…' : 'Sync now'} kind="ghost" Leading={UI.Shuffle} onPress={() => void hc.syncNow()} disabled={hc.busy} />
              <PillButton label="Permissions" kind="ghost" Leading={UI.Gear} onPress={() => void hc.openSettings()} />
              <PillButton label="Pause imports" kind="ghost" Leading={UI.Pause} onPress={hc.disconnect} />
            </>
          ) : (
            <PillButton label={hc.busy ? 'Connecting…' : hc.enabled ? 'Grant permissions' : 'Connect'} Leading={UI.Connect} onPress={() => void hc.connect()} disabled={hc.busy} />
          )}
        </Row>
      ) : hc.supported && (hc.status === 'not-installed' || hc.status === 'update-required') ? (
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <PillButton label={hc.status === 'update-required' ? 'Update Health Connect' : 'Install Health Connect'} kind="ghost" Leading={UI.External} onPress={() => void hc.openInstallPage()} />
          <PillButton label="Check again" kind="ghost" onPress={() => void hc.refreshStatus()} />
        </Row>
      ) : null}
      <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <PillButton label="Sources and rules" kind="ghost" compact Leading={UI.Info} onPress={() => router.push('/body/setup')} />
      </Row>
      {imported > 0 || autoEntries > 0 ? (
        <>
          <Divider />
          <Txt role="footnote" tone="secondary" style={{ marginTop: 10 }}>
            {`${imported} imported records and ${autoEntries} entries they created are stored on this phone.`}
          </Txt>
          <PillButton
            label="Remove imported data"
            kind="danger"
            Leading={UI.Trash}
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
            onPress={() =>
              confirm(
                'Remove imported data?',
                'Deletes every number imported from Health Connect, the automatic habit entries and water entries they created, and pauses imports. Nothing you logged by hand is touched; Health Connect itself keeps its data.',
                'Remove',
                hc.removeImported,
              )
            }
          />
        </>
      ) : null}
    </Card>
  );
}
