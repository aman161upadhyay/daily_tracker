import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { HabitIcon } from '@/src/domain/models';
import { useTracker } from '@/src/state/TrackerProvider';

const IMPORTS: { icon: HabitIcon; title: string; detail: string }[] = [
  { icon: 'steps', title: 'Steps', detail: 'Fills the Steps habit automatically' },
  { icon: 'moon', title: 'Sleep', detail: 'Duration and regularity' },
  { icon: 'heart', title: 'Resting heart rate', detail: 'Daily trend' },
  { icon: 'barbell', title: 'Workouts', detail: 'Imported as exercise sessions' },
  { icon: 'drop', title: 'Samsung Health water', detail: 'Merged into the water log; manual entries win' },
];

/**
 * Body tab. Health Connect needs a native module, so in Expo Go this screen
 * states that plainly instead of showing invented numbers.
 */
export default function BodyScreen() {
  const c = useColors();
  const router = useRouter();
  const { state } = useTracker();
  const stepsHabit = state.habits.find((h) => h.presetId === 'steps' && !h.archived);

  return (
    <Screen>
      <ScreenHeader title="Body" subtitle="From Health Connect" />

      <Card featured>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <IconTile Glyph={UI.Connect} color={c.cat.body} size={44} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">Health Connect</Txt>
            <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
              Not connected in this preview
            </Txt>
          </View>
        </Row>
        <Txt role="body" style={{ marginTop: 14 }}>
          Samsung Health, Fitbit and Google Fit data arrive through Android’s Health Connect. That needs the installed build of this app, not Expo Go, so
          nothing is shown here yet rather than made-up numbers.
        </Txt>
        <Txt role="footnote" tone="tertiary" style={{ marginTop: 10 }}>
          Import is read-only and stays on this phone. Manual entries always win over imported ones.
        </Txt>
      </Card>

      <SectionHeader title="What will appear here" />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {IMPORTS.map((item, i) => (
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
            {i < IMPORTS.length - 1 ? <Divider inset={52} /> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title="Until then" />
      <Card>
        <Txt role="body">
          {stepsHabit ? 'Your Steps habit is in the list; log a total by hand from its page.' : 'Add the Steps habit from the Library to log a daily total by hand.'}
        </Txt>
        <PillButton
          label={stepsHabit ? 'Open Steps' : 'Open the Library'}
          kind="ghost"
          Leading={UI.Caret}
          onPress={() => (stepsHabit ? router.push({ pathname: '/habit/[id]', params: { id: stepsHabit.id } }) : router.push('/habits'))}
          style={{ marginTop: 12, alignSelf: 'flex-start' }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    paddingVertical: 10,
  },
});
