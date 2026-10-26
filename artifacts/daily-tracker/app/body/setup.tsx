import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useHealthConnect } from '@/hooks/useHealthConnect';
import type { HabitIcon } from '@/src/domain/models';

interface Source {
  name: string;
  provides: string;
  steps: string[];
}

const SOURCES: Source[] = [
  {
    name: 'Samsung Health (Galaxy phones and watches)',
    provides: 'steps, sleep with stages, heart rate, workouts, weight, water',
    steps: ['Open Samsung Health → Settings (⋮ → Settings) → Health Connect.', 'Turn on syncing for the data types you want to share.', 'Sleep and heart rate come from a Galaxy Watch or Ring; the phone alone gives steps.'],
  },
  {
    name: 'Fitbit / Google Pixel Watch',
    provides: 'steps, sleep, heart rate, workouts, weight',
    steps: ['Fitbit app → your profile picture → Fitbit settings → Health Connect.', 'Turn on "Sync with Health Connect" and allow the data types.', 'Fitbit writes to Health Connect a few minutes after the watch syncs to the phone.'],
  },
  {
    name: 'Google Fit',
    provides: 'steps, workouts, weight (sleep and heart rate only with a connected watch)',
    steps: ['Google Fit → Profile → Settings (gear) → Sync Fit with Health Connect.', 'Google is retiring Google Fit; Samsung Health or Fitbit is the better long-term source.'],
  },
  {
    name: 'Garmin, Oura, WHOOP, Polar, Withings, Mi Fitness…',
    provides: 'whatever the maker chose to share',
    steps: ['Look for "Health Connect" in the app’s settings or connected-apps page.', 'Scales like Withings share weight; rings and bands share sleep and heart rate.'],
  },
];

const DATA: { icon: HabitIcon; title: string; detail: string }[] = [
  { icon: 'steps', title: 'Steps', detail: 'Daily totals per calendar day. Fills the Steps habit; a total you type yourself wins.' },
  { icon: 'moon', title: 'Sleep', detail: 'Each session is filed under the morning it ended. Awake time inside the session is subtracted when the source reports stages.' },
  { icon: 'heart', title: 'Heart rate', detail: 'Resting rate when the source reports one; otherwise the lowest reading of the day.' },
  { icon: 'lightning', title: 'Workouts', detail: 'Strength-type sessions of 15+ minutes tick Strength session. Walks are listed but do not count.' },
  { icon: 'barbell', title: 'Weight', detail: 'Every reading, shown in kg (or lb when units are set to oz).' },
  { icon: 'drop', title: 'Water', detail: 'Drinks from other apps join the water log once. A drink you logged here within five minutes wins.' },
];

/** The "Sources" sheet: which app feeds Health Connect, and what we do with each type. */
export default function BodySetupScreen() {
  const c = useColors();
  const hc = useHealthConnect();
  const router = useRouter();

  return (
    <Screen topInset={false}>
      <Card featured>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <IconTile Glyph={UI.Connect} color={c.cat.body} size={44} />
          <View style={{ flex: 1 }}>
            <Txt role="title2" heading>How the data gets here</Txt>
            <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
              Source app → Health Connect → Daily Tracker
            </Txt>
          </View>
        </Row>
        <Txt role="body" style={{ marginTop: 14 }}>
          Health Connect is Android’s shared health store. Your watch or phone app writes into it; this app only reads from it. Each app decides what it
          shares, so if a type is missing here, switch it on in the source app first.
        </Txt>
        <Txt role="footnote" tone="tertiary" style={{ marginTop: 10 }}>
          Android 14 and newer have Health Connect built in (Settings → Security & privacy → Privacy → Health Connect). Android 9–13 get it from the Play Store.
        </Txt>
        <PillButton label="What is read, and where it goes" kind="ghost" compact Leading={UI.Info} onPress={() => router.push('/health-privacy')} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
        {hc.supported ? (
          <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {hc.status === 'available' ? (
              <PillButton label="Open Health Connect" kind="ghost" Leading={UI.External} onPress={() => void hc.openSettings()} />
            ) : (
              <PillButton label="Get Health Connect" kind="ghost" Leading={UI.External} onPress={() => void hc.openInstallPage()} />
            )}
            {hc.status === 'available' && !hc.connected ? <PillButton label="Connect" Leading={UI.Connect} onPress={() => void hc.connect()} disabled={hc.busy} /> : null}
          </Row>
        ) : null}
      </Card>

      <SectionHeader title="Source apps" />
      {SOURCES.map((s) => (
        <Card key={s.name}>
          <Txt role="title2">{s.name}</Txt>
          <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
            Shares {s.provides}
          </Txt>
          <View style={{ marginTop: 10, gap: 6 }}>
            {s.steps.map((step, i) => (
              <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
                <Txt role="footnote" tone="tertiary" style={styles.bullet}>
                  {i + 1}.
                </Txt>
                <Txt role="footnote" style={{ flex: 1 }}>
                  {step}
                </Txt>
              </Row>
            ))}
          </View>
        </Card>
      ))}

      <SectionHeader title="What each type becomes" />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {DATA.map((item, i) => (
          <View key={item.title}>
            <Row gap={12} style={styles.row}>
              <IconTile icon={item.icon} color={c.cat.body} size={40} />
              <View style={{ flex: 1 }}>
                <Txt role="title2">{item.title}</Txt>
                <Txt role="footnote" tone="secondary">
                  {item.detail}
                </Txt>
              </View>
            </Row>
            {i < DATA.length - 1 ? <Divider inset={52} /> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title="Privacy" />
      <Card>
        <Txt role="body">
          Read-only: this app never writes to Health Connect. Imported numbers are stored in the same on-phone database as everything else, go into your
          backups, and can be removed from Settings at any time. Permissions can be withdrawn in Health Connect; the app notices on the next sync.
        </Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    paddingVertical: 10,
  },
  bullet: {
    width: 18,
  },
});
