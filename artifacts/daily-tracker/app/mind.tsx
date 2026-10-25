import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BreathCircle, phaseAt } from '@/components/tracker/BreathCircle';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Chip, IconButton, PillButton, Row, Segmented } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { MindKind } from '@/src/domain/models';
import { now } from '@/src/domain/time/clock';
import { formatMinSec } from '@/src/domain/time/format';
import { cancelMindEnd, scheduleMindEnd } from '@/src/services/notifications';
import { useTracker } from '@/src/state/TrackerProvider';

const MEDITATION_PRESETS = [5, 10, 13, 20];
const BREATHING_MINUTES = 5;

/** Timer for meditation and the cyclic-sighing breathing guide; logs a session on finish. */
export default function MindScreen() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { actions } = useTracker();

  const [kind, setKind] = useState<MindKind>(params.kind === 'BREATHING' ? 'BREATHING' : 'MEDITATION');
  const [minutes, setMinutes] = useState(13);
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | null>(null);
  const [done, setDone] = useState(false);

  const totalMs = (kind === 'BREATHING' ? BREATHING_MINUTES : minutes) * 60_000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);

  // The end bell is a scheduled notification, so it rings even if the screen locks mid-session.
  useEffect(() => {
    if (!running) {
      void cancelMindEnd();
      return;
    }
    void scheduleMindEnd(now() + remainingMs, Math.round(totalMs / 60_000), kind).catch(() => {});
    return () => void cancelMindEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

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
  }, [running, totalMs]);

  useEffect(() => {
    if (!done) return;
    actions.logMind(kind, Math.round(totalMs / 60_000));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [done, actions, kind, totalMs]);

  const reset = (nextKind?: MindKind) => {
    setRunning(false);
    setElapsedMs(0);
    setDone(false);
    if (nextKind) setKind(nextKind);
  };

  const finishEarly = () => {
    const mins = Math.max(1, Math.round(elapsedMs / 60_000));
    setRunning(false);
    if (elapsedMs >= 60_000) actions.logMind(kind, mins);
    router.back();
  };

  const title = kind === 'BREATHING' ? 'Cyclic sighing' : 'Meditation';

  return (
    <Screen topInset={false} contentStyle={{ alignItems: 'stretch' }}>
      <Stack.Screen options={{ title: 'Mind' }} />

      <Segmented<MindKind>
        options={[
          { value: 'MEDITATION', label: 'Meditate' },
          { value: 'BREATHING', label: 'Breathe' },
        ]}
        value={kind}
        onChange={(k) => reset(k)}
      />

      <Card featured={running} style={{ alignItems: 'center' }}>
        <Txt role="footnote" tone="secondary" style={{ alignSelf: 'flex-start' }}>
          {title}
        </Txt>
        <View style={styles.stage}>
          {kind === 'BREATHING' ? (
            <>
              <BreathCircle running={running} />
              <Txt role="title2" tone="violet" style={{ marginTop: 8 }}>
                {running ? phaseAt(elapsedMs) : done ? 'Done' : 'Ready when you are'}
              </Txt>
            </>
          ) : (
            <View style={[styles.dial, { borderColor: running ? c.violet : c.hairline }]}>
              <UI.Lotus size={36} color={c.cat.mind} weight="duotone" duotoneColor={c.cat.mind} />
            </View>
          )}
          <Txt role="display" style={{ marginTop: 16 }}>
            {formatMinSec(remainingMs / 1000)}
          </Txt>
          <Txt role="footnote" tone="secondary">
            {done ? 'Session logged' : running ? 'remaining' : `${Math.round(totalMs / 60_000)} minutes`}
          </Txt>
        </View>

        {kind === 'MEDITATION' && !running && !done && elapsedMs === 0 ? (
          <Row gap={8} style={{ marginTop: 8 }}>
            {MEDITATION_PRESETS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={minutes === m} color={c.cat.mind} onPress={() => setMinutes(m)} />
            ))}
          </Row>
        ) : null}

        <Row gap={10} style={{ marginTop: 20, alignSelf: 'stretch' }}>
          {done ? (
            <>
              <PillButton label="Again" kind="ghost" onPress={() => reset()} style={{ flex: 1 }} />
              <PillButton label="Done" Leading={UI.Check} color={c.cat.mind} onPress={() => router.back()} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <PillButton label={running ? 'Pause' : elapsedMs > 0 ? 'Resume' : 'Start'} Leading={running ? UI.Pause : UI.Play} color={c.cat.mind} onPress={() => setRunning((r) => !r)} style={{ flex: 1 }} />
              {elapsedMs > 0 ? <PillButton label="Finish" kind="ghost" onPress={finishEarly} /> : null}
              {elapsedMs > 0 ? <IconButton Glyph={UI.Undo} label="Reset timer" onPress={() => reset()} size={48} color={c.text} /> : null}
            </>
          )}
        </Row>
      </Card>

      <Card>
        <Txt role="body">
          {kind === 'BREATHING'
            ? 'Breathe in through the nose, take a second short sip of air, then let it all out slowly through the mouth. Five minutes a day improved mood and lowered breathing rate more than mindfulness in a one-month trial.'
            : 'Thirteen minutes a day for eight weeks improved attention, memory and mood in people who had never meditated. Four weeks was not enough — the streak is the point.'}
        </Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dial: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
