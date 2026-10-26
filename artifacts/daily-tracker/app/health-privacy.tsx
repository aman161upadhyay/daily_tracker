import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { useHealthConnect } from '@/hooks/useHealthConnect';
import { useBackOrHome } from '@/hooks/useBackOrHome';

const READS: { title: string; why: string }[] = [
  { title: 'Steps', why: 'Daily totals fill the Steps habit, so a day you walked counts without typing.' },
  { title: 'Sleep', why: 'Each night’s length and stages, filed under the morning it ended, for the Body page.' },
  { title: 'Heart rate', why: 'One row per day for the Body page: the resting rate plus the day’s lowest, average and highest. Individual readings are not kept.' },
  { title: 'Workouts', why: 'Strength sessions tick the Strength habit; other workouts are listed.' },
  { title: 'Weight', why: 'Readings from a scale app, shown on the Body page.' },
  { title: 'Water', why: 'Drinks logged in other apps join the water log once, so the goal counts them.' },
];

const PROMISES: string[] = [
  'Read only. Nothing is written back into Health Connect.',
  'The data stays in this app’s private storage on your phone. There is no account and no server, and the app makes no network requests of its own (the only links it opens — evidence sources, the Play Store — open in your browser).',
  'The phone’s own Android backup may carry the app’s data to your Google account, encrypted with your screen lock — you can turn that off in Settings → Your data.',
  'Background reading, when you allow it, only refreshes the same figures while the app is closed.',
  'Nothing is sold, shared or used for advertising. The app shows no ads and contains no analytics.',
];

/**
 * Health Connect’s privacy rationale: what the "privacy policy" link in the permission dialog
 * opens (through HealthRationaleActivity → `daily-tracker://health-privacy`). Works offline, as
 * Android requires, and doubles as the plain-language explanation reachable from Body.
 */
export default function HealthPrivacyScreen() {
  const c = useColors();
  const hc = useHealthConnect();
  const leave = useBackOrHome();

  return (
    <Screen>
      <Card featured>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <IconTile Glyph={UI.Connect} color={c.cat.body} size={44} />
          <View style={{ flex: 1 }}>
            <Txt role="title1">Your health data</Txt>
            <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
              What Daily Tracker reads from Health Connect, and where it goes
            </Txt>
          </View>
        </Row>
        <Txt role="body" style={{ marginTop: 14 }}>
          Daily Tracker reads a few health figures so the habits you track can tick themselves. What it reads is kept inside the app on this
          phone and used only to show you your own numbers. The one copy that can leave is Android's phone backup, if you left that on in
          Settings → Backup (encrypted with your screen lock); the app itself sends nothing anywhere.
        </Txt>
      </Card>

      <SectionHeader title="What is read, and why" />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {READS.map((item, i) => (
          <View key={item.title}>
            <View style={styles.row}>
              <Txt role="title2">{item.title}</Txt>
              <Txt role="footnote" tone="secondary">
                {item.why}
              </Txt>
            </View>
            {i < READS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title="What never happens" />
      <Card>
        <View style={{ gap: 10 }}>
          {PROMISES.map((p) => (
            <Row key={p} gap={10} style={{ alignItems: 'flex-start' }}>
              <UI.Check size={18} color={c.greenBright} weight="bold" />
              <Txt role="footnote" style={{ flex: 1 }}>
                {p}
              </Txt>
            </Row>
          ))}
        </View>
      </Card>

      <SectionHeader title="Your control" />
      <Card>
        <Txt role="body">
          Allow or remove any type at any time in Health Connect; the app reads only what is ticked there. Settings → Connections → Health
          Connect → Pause imports stops all reading, "Remove imported data" there deletes what was read, and Settings → Your data → Erase
          everything deletes it along with everything else.
        </Txt>
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {hc.supported && hc.status === 'available' ? <PillButton label="Open Health Connect" kind="ghost" Leading={UI.External} onPress={() => void hc.openSettings()} /> : null}
          <PillButton label="Done" onPress={leave} />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 2 },
});
