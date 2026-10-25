import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { HabitGlyph, UI } from '@/components/ui/icons';
import { PillButton, Row } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { newId, now } from '@/src/domain/time/clock';
import { formatMinSec } from '@/src/domain/time/format';
import { PRESET_BY_ID } from '@/src/library/presets';
import { useTracker } from '@/src/state/TrackerProvider';

const SQUAT_SECONDS = 60;
const FOLLOW_UP_MINUTES = 20;

/**
 * Sugar Shield: a 60-second squat countdown right before something sweet,
 * then a one-off reminder to walk for two minutes twenty minutes later.
 */
export default function ShieldScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, actions } = useTracker();
  const preset = PRESET_BY_ID['sugar-shield'];

  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [done, setDone] = useState(false);
  const startedAt = useRef<number | null>(null);
  const totalMs = SQUAT_SECONDS * 1000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);

  useEffect(() => {
    if (!running) return;
    const base = elapsedMs;
    startedAt.current = now();
    const id = setInterval(() => {
      const e = base + (now() - (startedAt.current ?? now()));
      setElapsedMs(e);
      if (e >= totalMs) {
        clearInterval(id);
        setRunning(false);
        setDone(true);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const pending = useMemo(() => state.events.filter((e) => e.id.startsWith('shield-') && e.at > now()), [state.events]);

  const finish = () => {
    const habit = state.habits.find((h) => h.presetId === 'sugar-shield');
    actions.logSnack('SQUATS', { habitId: habit?.id, trigger: 'SUGAR_SHIELD' });
    actions.scheduleEvent({
      id: `shield-${newId()}`,
      habitId: habit?.id ?? 'sugar-shield',
      inMinutes: FOLLOW_UP_MINUTES,
      title: 'Post-meal walk',
      body: 'Two minutes on your feet — the second half of the Sugar Shield.',
    });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  useEffect(() => {
    if (done && Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [done]);

  return (
    <Screen topInset={false} contentStyle={{ alignItems: 'stretch' }}>
      <Stack.Screen options={{ title: 'Sugar Shield' }} />

      <Card featured={running} style={{ alignItems: 'center' }}>
        <Txt role="footnote" tone="secondary" style={{ alignSelf: 'flex-start' }}>
          Before something sweet
        </Txt>
        <View style={styles.stage}>
          <View style={[styles.dial, { borderColor: running ? c.green : done ? c.gold : c.hairline }]}>
            <HabitGlyph icon="shield" size={40} color={done ? c.gold : c.green} weight="duotone" duotoneColor={done ? c.gold : c.green} />
          </View>
          <Txt role="display" style={{ marginTop: 16 }}>
            {done ? 'Done' : formatMinSec(remainingMs / 1000)}
          </Txt>
          <Txt role="footnote" tone="secondary" align="center">
            {done ? `A ${FOLLOW_UP_MINUTES}-minute walk reminder will follow.` : running ? 'Air squats, steady pace — keep breathing' : `${SQUAT_SECONDS} seconds of squats`}
          </Txt>
        </View>

        <Row gap={10} style={{ marginTop: 20, alignSelf: 'stretch' }}>
          {done ? (
            <PillButton label="Log & set the walk reminder" Leading={UI.Check} color={c.gold} onPress={finish} style={{ flex: 1 }} />
          ) : (
            <>
              <PillButton label={running ? 'Pause' : elapsedMs > 0 ? 'Resume' : 'Start'} Leading={running ? UI.Pause : UI.Play} color={c.green} onPress={() => setRunning((r) => !r)} style={{ flex: 1 }} />
              <PillButton label="Did it already" kind="ghost" onPress={finish} />
            </>
          )}
        </Row>
      </Card>

      {pending.length > 0 ? (
        <Card>
          <Row gap={10} style={{ alignItems: 'center' }}>
            <HabitGlyph icon="walk" size={20} color={c.cat.movement} />
            <Txt role="body" style={{ flex: 1 }}>
              Walk reminder set for {new Date(pending[0]!.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
            </Txt>
            <PillButton label="Cancel" kind="ghost" onPress={() => actions.removeEvent(pending[0]!.id)} />
          </Row>
        </Card>
      ) : null}

      <Card>
        <Txt role="body">{preset?.why}</Txt>
        <Txt role="footnote" tone="secondary" style={{ marginTop: 8 }}>
          Evidence: {preset?.evidence}. The squats count towards today's Sugar Shield uses, not the movement-snack rotation.
        </Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: 20 },
  dial: { width: 148, height: 148, borderRadius: 74, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
