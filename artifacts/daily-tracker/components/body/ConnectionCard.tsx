import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { IconTile, PillButton, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { HealthConnectUi } from '@/hooks/useHealthConnect';
import { BODY_RECORD_TYPES, listRecordTypes } from '@/src/domain/body/types';
import { formatClock, formatDayShort } from '@/src/domain/time/format';
import { calendarDayOf, minutesOfDay } from '@/src/domain/time/trackingDay';

export function describeLastSync(lastSyncAt: number | undefined, nowMs: number, zone: string): string {
  if (lastSyncAt === undefined) return 'Not synced yet';
  const day = calendarDayOf(lastSyncAt, zone);
  const today = calendarDayOf(nowMs, zone);
  const clock = formatClock(minutesOfDay(lastSyncAt, zone));
  return day === today ? `Synced ${clock}` : `Synced ${formatDayShort(day)} ${clock}`;
}

interface Props {
  hc: HealthConnectUi;
  nowMs: number;
  zone: string;
  /** The state holds sample numbers (web preview / "Load sample data"). */
  sample: boolean;
  /** Whether any imported numbers exist, to decide between the empty pitch and the status row. */
  hasData: boolean;
}

/**
 * The card at the top of the Body tab. It says exactly where things stand:
 * unsupported here, Health Connect missing, ready to connect, or connected.
 */
export function ConnectionCard({ hc, nowMs, zone, sample, hasData }: Props) {
  const c = useColors();
  const router = useRouter();
  const gold = c.cat.body;

  if (!hc.supported) {
    return (
      <Card featured>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <IconTile Glyph={UI.Connect} color={gold} size={44} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">Health Connect</Txt>
            <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
              {sample ? 'Sample numbers below' : 'Not available in this preview'}
            </Txt>
          </View>
        </Row>
        <Txt role="body" style={{ marginTop: 14 }}>
          {sample
            ? 'These are sample numbers. On the installed Android build this card connects to Health Connect and the real ones from Samsung Health, Fitbit or Google Fit replace them.'
            : 'Samsung Health, Fitbit and Google Fit data arrive through Android’s Health Connect. That needs the installed build of this app, not Expo Go or the web preview, so nothing is shown here rather than made-up numbers.'}
        </Txt>
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <PillButton label="How it works" kind="ghost" Leading={UI.Info} onPress={() => router.push('/body/setup')} />
        </Row>
        <Txt role="footnote" tone="tertiary" style={{ marginTop: 10 }}>
          Import is read-only; what is read is kept inside the app (and in the phone backup, if that is on). Manual entries always win over imported ones.
        </Txt>
      </Card>
    );
  }

  if (hc.status === 'checking') {
    return (
      <Card featured>
        <Row gap={12}>
          <IconTile Glyph={UI.Connect} color={gold} size={44} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">Health Connect</Txt>
            <Txt role="footnote" tone="secondary">
              Checking…
            </Txt>
          </View>
        </Row>
      </Card>
    );
  }

  if (hc.status === 'not-installed' || hc.status === 'update-required') {
    const update = hc.status === 'update-required';
    return (
      <Card featured>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <IconTile Glyph={UI.Connect} color={gold} size={44} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">Health Connect</Txt>
            <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
              {update ? 'Needs an update' : 'Not installed on this phone'}
            </Txt>
          </View>
        </Row>
        <Txt role="body" style={{ marginTop: 14 }}>
          {update
            ? 'The Health Connect app on this phone is too old to share data. Update it from the Play Store, then come back here.'
            : 'Health Connect is built into Android 14 and newer; on older Android it is a free app from Google. Install it, let Samsung Health or your watch app sync into it, then connect here.'}
        </Txt>
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <PillButton label={update ? 'Update Health Connect' : 'Install Health Connect'} Leading={UI.External} onPress={() => void hc.openInstallPage()} />
          <PillButton label="I installed it" kind="ghost" onPress={() => void hc.refreshStatus()} />
          <PillButton label="How it works" kind="ghost" Leading={UI.Info} onPress={() => router.push('/body/setup')} />
        </Row>
      </Card>
    );
  }

  if (!hc.connected) {
    return (
      <Card featured>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <IconTile Glyph={UI.Connect} color={gold} size={44} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">Health Connect</Txt>
            <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
              {hasData ? 'Disconnected · imports paused' : 'Ready to connect'}
            </Txt>
          </View>
        </Row>
        <Txt role="body" style={{ marginTop: 14 }}>
          Read steps, sleep, heart rate, weight, workouts and water from whatever already syncs into Health Connect. Steps fill the Steps habit, strength
          workouts tick Strength session, drinks join the water log.
        </Txt>
        {hc.lastError ? (
          <Txt role="footnote" color={c.danger} style={{ marginTop: 10 }}>
            {hc.lastError}
          </Txt>
        ) : null}
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <PillButton label={hc.busy ? 'Connecting…' : 'Connect'} Leading={UI.Connect} onPress={() => void hc.connect()} disabled={hc.busy} />
          <PillButton label="How it works" kind="ghost" Leading={UI.Info} onPress={() => router.push('/body/setup')} />
        </Row>
        <Txt role="footnote" tone="tertiary" style={{ marginTop: 10 }}>
          Read-only. Nothing is written back to Health Connect; what is read is kept inside the app (and in the phone backup, if that is on).
        </Txt>
      </Card>
    );
  }

  const types = hc.granted.length;
  const missing = BODY_RECORD_TYPES.filter((t) => !hc.granted.includes(t));
  return (
    <Card>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <IconTile Glyph={UI.Connect} color={gold} size={44} />
        <View style={{ flex: 1 }}>
          <Txt role="title2">Health Connect</Txt>
          <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
            {`Connected · ${types} of 7 data types · ${describeLastSync(hc.lastSyncAt, nowMs, zone)}`}
          </Txt>
          <Txt role="footnote" tone="tertiary" style={{ marginTop: 2 }}>
            {hc.background ? 'Also syncs in the background every few hours.' : 'Syncs whenever you open the app.'}
          </Txt>
          <Txt role="footnote" tone="tertiary" style={{ marginTop: 6 }}>
            {`Reading ${listRecordTypes(hc.granted)}.`}
          </Txt>
          {missing.length > 0 ? (
            <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
              {`Not allowed: ${listRecordTypes(missing)} — a metric that is off here stays empty, whatever the source app has. Change it under Permissions.`}
            </Txt>
          ) : null}
        </View>
      </Row>
      {hc.lastError ? (
        <Txt role="footnote" color={c.danger} style={{ marginTop: 10 }}>
          {hc.lastError}
        </Txt>
      ) : null}
      <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <PillButton label={hc.busy ? 'Syncing…' : 'Sync now'} kind="ghost" Leading={UI.Shuffle} onPress={() => void hc.syncNow()} disabled={hc.busy} />
        <PillButton label="Permissions" kind="ghost" Leading={UI.Gear} onPress={() => void hc.openSettings()} />
        <PillButton label="Sources" kind="ghost" Leading={UI.Info} onPress={() => router.push('/body/setup')} />
      </Row>
    </Card>
  );
}
