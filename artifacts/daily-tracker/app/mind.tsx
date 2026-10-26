import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useBackOrHome } from '@/hooks/useBackOrHome';
import { BreathCircle, phaseAt } from '@/components/tracker/BreathCircle';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Chip, IconButton, PillButton, Row, Segmented, Stepper } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { MindKind } from '@/src/domain/models';
import { now } from '@/src/domain/time/clock';
import { formatClock, formatMinSec } from '@/src/domain/time/format';
import { minutesOfDay } from '@/src/domain/time/trackingDay';
import { cancelMindEnd, scheduleMindEnd } from '@/src/services/notifications';
import { useTracker } from '@/src/state/TrackerProvider';
import { useClockFormat } from '@/src/state/hooks';
import { showToast } from '@/components/ui/Toast';

const MEDITATION_PRESETS = [5, 10, 13, 20];
const BREATHING_MINUTES = 5;
const minutesWord = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;

/** Timer for meditation and the cyclic-sighing breathing guide; logs a session on finish. */
export default function MindScreen() {
  const c = useColors();
  const goBack = useBackOrHome();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { actions, zone } = useTracker();
  const clock = useClockFormat();

  const [kind, setKind] = useState<MindKind>(params.kind === 'BREATHING' ? 'BREATHING' : 'MEDITATION');
  const [minutes, setMinutes] = useState(13);
  // "Other": any length from a minute up, typed or stepped (the presets are the studied doses).
  const [custom, setCustom] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | null>(null);
  const [done, setDone] = useState(false);

  const totalMs = (kind === 'BREATHING' ? BREATHING_MINUTES : minutes) * 60_000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);

  // Leaving mid-session (system Back, the header arrow, a swipe) asks first instead of silently
  // dropping the minutes and the bell. Finish / Done / Discard set `leaving` and pass through.
  const navigation = useNavigation();
  const latest = useRef({ elapsedMs, done, kind, running, leaving: false });
  useLayoutEffect(() => {
    latest.current = { ...latest.current, elapsedMs, done, kind, running };
  });
  // One session is logged once, whichever path gets there first (the clock running out, Finish,
  // or the leave dialog); a dialog answered after the bell must not add a second entry.
  const logged = useRef(false);
  /** The instant the clock ran out (not the moment the screen noticed): the session's real end. */
  const completedAt = useRef<number | null>(null);
  const logOnce = (k: MindKind, mins: number, endAt?: number) => {
    if (logged.current) return;
    logged.current = true;
    actions.logMind(k, mins, endAt !== undefined ? { endAt } : undefined);
  };
  useEffect(() => {
    if (Platform.OS === 'web') return;
    return navigation.addListener('beforeRemove', (e) => {
      const cur = latest.current;
      if (cur.leaving || cur.done || cur.elapsedMs === 0) return;
      e.preventDefault();
      // The clock stops while the question is open, so the minutes offered are the minutes logged
      // and the session cannot complete (and log itself) behind the dialog.
      const wasRunning = cur.running;
      if (wasRunning) setRunning(false);
      const mins = Math.max(1, Math.round(cur.elapsedMs / 60_000));
      const leave = () => {
        latest.current.leaving = true;
        setRunning(false);
        navigation.dispatch(e.data.action);
      };
      Alert.alert(
        'Leave the timer?',
        cur.elapsedMs >= 60_000 ? `Finishing logs ${mins} min; discarding keeps today as it was.` : 'Under a minute so far, so nothing would be logged.',
        [
          { text: 'Keep timing', style: 'cancel', onPress: () => wasRunning && setRunning(true) },
          ...(cur.elapsedMs >= 60_000
            ? [
                {
                  text: `Finish · log ${mins} min`,
                  onPress: () => {
                    logOnce(cur.kind, mins);
                    leave();
                  },
                },
              ]
            : []),
          { text: 'Discard', style: 'destructive' as const, onPress: leave },
        ],
        { cancelable: true, onDismiss: () => wasRunning && setRunning(true) },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, actions]);

  // The end bell is a scheduled notification, so it rings even if the screen locks mid-session.
  // Only a bell this screen set is ever cancelled: opening the screen idle must leave alone the
  // bell of a session the app was killed in the middle of — that bell (tapped later) is the one
  // thing that still logs those minutes.
  const bellSet = useRef(false);
  /** The instant the running session's bell is set for (fixed for the session: the clock runs on wall time). */
  const bellAt = useRef(0);
  const [bellError, setBellError] = useState<string | null>(null);
  /** The bell of a stopped session is still set (its cancel failed): shown while the timer is not running. */
  const [bellStale, setBellStale] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  /**
   * The bell of a stopped session could not be cancelled (three tries): said where the person is —
   * on this screen while it is open, as a toast after leaving it — because the phone will ring
   * "Session complete" at the planned time, and a tap on that bell logs the session.
   */
  const bellOutlived = (err: unknown) => {
    console.warn('Could not cancel the end bell', err);
    if (bellAt.current <= now()) return; // Due already: the bell is the session's own and should ring.
    const at = formatClock(minutesOfDay(bellAt.current, zone), clock);
    const message = `The end bell could not be cancelled, so the phone may still ring at ${at}. Swipe that notification away — tapping it would log the session.`;
    if (mounted.current) setBellStale(message);
    else showToast({ message, durationMs: 10_000 });
  };
  useEffect(() => {
    if (!running) {
      if (bellSet.current) {
        bellSet.current = false;
        cancelMindEnd().catch(bellOutlived);
      }
      return;
    }
    bellSet.current = true;
    bellAt.current = now() + remainingMs;
    setBellError(null);
    setBellStale(null);
    scheduleMindEnd(bellAt.current, Math.round(totalMs / 60_000), kind).catch((err) => {
      console.warn('Could not schedule the end bell', err);
      setBellError('The end bell could not be set, so the phone will not ring when time is up. Keep the screen on, or check notification permission in Settings.');
    });
    return () => {
      if (bellSet.current) {
        bellSet.current = false;
        cancelMindEnd().catch(bellOutlived);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Coming back mid-session (typically from the "Alarms & reminders" settings page) re-submits the
  // bell, so it is set with the precision the phone allows now rather than the one it had before.
  useEffect(() => {
    if (!running || Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' || !bellSet.current || bellAt.current - now() < 1000) return;
      scheduleMindEnd(bellAt.current, Math.round(totalMs / 60_000), kind).catch((err) => {
        // The re-submission clears the first bell before it sets the new one (same identifier, one
        // queue), so a refusal here leaves no bell at all: said on the screen, not in a console line.
        console.warn('Could not re-submit the end bell', err);
        setBellError('The end bell could not be re-set after coming back, so the phone will not ring when time is up. Keep the screen on until the timer ends.');
      });
    });
    return () => sub.remove();
  }, [running, totalMs, kind]);

  useEffect(() => {
    if (!running) return;
    const base = elapsedMs;
    startedAt.current = now();
    const id = setInterval(() => {
      const e = base + (now() - (startedAt.current ?? now()));
      setElapsedMs(e);
      if (e >= totalMs) {
        // Android may have paused this timer while the screen was locked: the session ended when the
        // clock reached the total, which is what the end bell's own log (and its dedupe) uses too.
        completedAt.current = (startedAt.current ?? now()) + (totalMs - base);
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
    logOnce(kind, Math.round(totalMs / 60_000), completedAt.current ?? undefined);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, kind, totalMs]);

  const reset = (nextKind?: MindKind) => {
    const apply = () => {
      setRunning(false);
      setElapsedMs(0);
      setDone(false);
      logged.current = false;
      completedAt.current = null;
      if (nextKind) setKind(nextKind);
    };
    // A minute or more on the clock is worth a question before it is thrown away.
    if (!done && elapsedMs >= 60_000 && Platform.OS !== 'web') {
      const wasRunning = running;
      if (wasRunning) setRunning(false);
      const mins = Math.max(1, Math.round(elapsedMs / 60_000));
      Alert.alert(
        nextKind ? 'Switch and discard?' : 'Reset the timer?',
        `${mins} min so far would not be logged.`,
        [
          { text: 'Keep timing', style: 'cancel', onPress: () => wasRunning && setRunning(true) },
          { text: 'Discard', style: 'destructive', onPress: apply },
        ],
        { cancelable: true, onDismiss: () => wasRunning && setRunning(true) },
      );
      return;
    }
    apply();
  };

  const leave = () => {
    latest.current.leaving = true;
    goBack();
  };

  const finishEarly = () => {
    const mins = Math.max(1, Math.round(elapsedMs / 60_000));
    setRunning(false);
    if (elapsedMs >= 60_000) logOnce(kind, mins);
    leave();
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
              <BreathCircle running={running} elapsedMs={elapsedMs} />
              <Txt role="title2" tone="violet" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
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
            {done ? 'Session logged' : running ? 'remaining' : minutesWord(Math.round(totalMs / 60_000))}
          </Txt>
        </View>

        {kind === 'MEDITATION' && !running && !done && elapsedMs === 0 ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {MEDITATION_PRESETS.map((m) => (
                <Chip
                  key={m}
                  label={`${m} min`}
                  selected={!custom && minutes === m}
                  color={c.cat.mind}
                  onPress={() => {
                    setCustom(false);
                    setMinutes(m);
                  }}
                />
              ))}
              <Chip label="Other" selected={custom} color={c.cat.mind} onPress={() => setCustom(true)} accessibilityLabel="Other length" />
            </Row>
            {custom ? <Stepper value={minutes} onChange={(m) => setMinutes(Math.max(1, Math.min(120, Math.round(m))))} min={1} max={120} label="minutes" /> : null}
          </View>
        ) : null}

        <Row gap={10} style={{ marginTop: 20, alignSelf: 'stretch' }}>
          {done ? (
            <>
              <PillButton label="Again" kind="ghost" onPress={() => reset()} style={{ flex: 1 }} />
              <PillButton label="Done" Leading={UI.Check} color={c.cat.mind} onPress={leave} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <PillButton label={running ? 'Pause' : elapsedMs > 0 ? 'Resume' : 'Start'} Leading={running ? UI.Pause : UI.Play} color={c.cat.mind} onPress={() => setRunning((r) => !r)} style={{ flex: 1 }} />
              {elapsedMs > 0 ? (
                <PillButton
                  label="Finish"
                  accessibilityLabel={elapsedMs >= 60_000 ? `Finish and log ${minutesWord(Math.max(1, Math.round(elapsedMs / 60_000)))}` : 'Finish without logging'}
                  kind="ghost"
                  onPress={finishEarly}
                />
              ) : null}
              {elapsedMs > 0 ? <IconButton Glyph={UI.Undo} label="Reset timer" onPress={() => reset()} size={48} color={c.text} /> : null}
            </>
          )}
        </Row>
        {!done && elapsedMs > 0 ? (
          <Txt role="caption" tone="tertiary" align="center" style={{ marginTop: 10 }}>
            {elapsedMs >= 60_000
              ? `Finishing now logs ${Math.max(1, Math.round(elapsedMs / 60_000))} min.`
              : 'Sessions under a minute are not logged — finishing now keeps today as it was.'}
          </Txt>
        ) : null}
        {bellError && running ? (
          <Txt role="caption" tone="gold" align="center" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
            {bellError}
          </Txt>
        ) : null}
        {bellStale && !running ? (
          <Txt role="caption" tone="gold" align="center" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
            {bellStale}
          </Txt>
        ) : null}
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
