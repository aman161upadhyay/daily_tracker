import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Switch, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Chip, Divider, PillButton, Row, Stepper } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { ScheduledNudge } from '@/src/domain/nudges/planner';
import { formatClock, parseClockInput, weekdayName, type ClockFormat } from '@/src/domain/time/format';
import { addDays, calendarDayOf, instantOf, minutesOfDay } from '@/src/domain/time/trackingDay';
import { NOTIFICATIONS_SUPPORTED, SupersededError, cancelTestRing, exactAlarmsAllowed, getPermission, onSyncHealth, openExactAlarmSettings, openNotificationSettings, requestPermission, scheduleTestRing, syncHealth, type PermissionState, type SyncHealth } from '@/src/services/notifications';
import { REMINDER_TEST_CHECKS, TEST_RING_LEAD_MS, reminderTestLine, reminderTestPhase, type ReminderTest } from '@/src/domain/nudges/reminderTest';
import { nudgePlan } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';
import { useClockFormat } from '@/src/state/hooks';

/** Notification permission and exact-alarm access, re-read whenever the app comes back from Settings. */
function useNotificationPermission(): [PermissionState, boolean | null, () => Promise<void>] {
  const [perm, setPerm] = useState<PermissionState>(NOTIFICATIONS_SUPPORTED ? 'undetermined' : 'unsupported');
  const [exact, setExact] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    setPerm(await getPermission());
    setExact(exactAlarmsAllowed());
  }, []);
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);
  return [perm, exact, refresh];
}

/** Whether the last reminder sync went through (see notifications.syncHealth). */
function useSyncHealth(): SyncHealth {
  const [health, setHealth] = useState<SyncHealth>(() => syncHealth());
  useEffect(() => onSyncHealth(setHealth), []);
  return health;
}

const OFF_CHOICES: { label: string; hours: number | 'day' | null }[] = [
  { label: '2 hours', hours: 2 },
  { label: 'Rest of today', hours: 'day' },
  { label: '3 days', hours: 72 },
];

/** "Tomorrow" by the calendar, as a person reads a clock (a 1:00 AM ring belongs to the previous tracking day). */
function describeNudge(n: ScheduledNudge, zone: string, nowMs: number, clock: ClockFormat): string {
  const ringDay = calendarDayOf(n.at, zone);
  const nowDay = calendarDayOf(nowMs, zone);
  const dayLabel = ringDay === nowDay ? '' : ringDay === addDays(nowDay, 1) ? 'Tomorrow ' : `${ringDay} `;
  // A rotation's or a merged notification's title is generic ("Movement snack", "Time for a break");
  // the body names what it will actually say ("10 push-ups — push-up snack"), as Today's card does.
  const what = n.kind === 'ROTATION' || n.mergedIds ? n.body : n.title;
  return `${dayLabel}${formatClock(minutesOfDay(n.at, zone), clock)} · ${what}`;
}

/** Settings → Reminders: master switch, permissions, off mode, weekly summary and a preview of what is scheduled. */
export function RemindersCard() {
  const c = useColors();
  const { state, actions, today, nowMs, zone } = useTracker();
  const clock = useClockFormat();
  const s = state.settings;
  const [perm, exact, refresh] = useNotificationPermission();
  const health = useSyncHealth();
  const plan = nudgePlan(state, today, nowMs, zone);
  const paused = s.offUntil !== undefined && s.offUntil > nowMs;

  // The reminder self-test: one ring a minute out, then the question — the app cannot see its own
  // notification on a locked screen, so the person answers. Kept for this visit of the screen. One
  // request at a time (the button disables while the OS is asked, and a flag covers the gap before
  // the render); a result that arrives after the card is gone is dropped.
  const [test, setTest] = useState<ReminderTest | null>(null);
  const [testResult, setTestResult] = useState<'ok' | 'missed' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const testInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const testPhase = reminderTestPhase(test, nowMs);
  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const startTest = () => {
    if (testInFlight.current) return;
    testInFlight.current = true;
    const dueAt = Date.now() + TEST_RING_LEAD_MS;
    setTestResult(null);
    setTestError(null);
    setTestBusy(true);
    scheduleTestRing(dueAt)
      .then(
        () => {
          if (mounted.current) setTest({ dueAt });
        },
        (err: unknown) => {
          // A newer request overtook this one: that request reports for itself.
          if (mounted.current && !(err instanceof SupersededError)) setTestError(`The test could not be scheduled: ${errorText(err)}`);
        },
      )
      .finally(() => {
        testInFlight.current = false;
        if (mounted.current) setTestBusy(false);
      });
  };
  // The ring is forgotten only once the OS has really dropped it; a refused cancel is said, and the
  // test stays so Cancel can be tried again.
  const stopTest = () => {
    if (testInFlight.current) return;
    testInFlight.current = true;
    setTestError(null);
    cancelTestRing()
      .then(
        () => {
          if (mounted.current) setTest(null);
        },
        (err: unknown) => {
          if (mounted.current) setTestError(`The test could not be cancelled (${errorText(err)}); it may still ring.`);
        },
      )
      .finally(() => {
        testInFlight.current = false;
      });
  };

  const pauseFor = (hours: number | 'day') => {
    // "Rest of today" is the rest of the tracking day: it ends at the day boundary (3 am by default),
    // not at the active end — a night owl's 1 am slots are still today's, and a pause set at 11 pm
    // would otherwise end a minute later or, with the active end already past, not at all.
    const until = hours === 'day' ? instantOf(addDays(today, 1), s.dayBoundaryHour * 60, zone) : nowMs + hours * 3_600_000;
    actions.updateSettings({ offUntil: Math.max(until, nowMs + 60_000) });
  };

  const permissionRow = () => {
    if (perm === 'unsupported') {
      return (
        <Txt role="footnote" tone="secondary">
          Notifications are not available in the browser preview. On the phone, this card asks for permission and lists what is scheduled.
        </Txt>
      );
    }
    if (perm === 'granted') {
      return (
        <Row gap={8} style={{ alignItems: 'center' }}>
          <UI.Check size={18} color={c.green} weight="bold" />
          <Txt role="body" style={{ flex: 1 }}>
            Notifications allowed
          </Txt>
          {Platform.OS === 'android' && exact !== true ? <PillButton label={exact === false ? 'Allow exact timing' : 'Exact timing'} kind="ghost" onPress={() => void openExactAlarmSettings()} /> : null}
        </Row>
      );
    }
    if (perm === 'denied') {
      return (
        <Row gap={8} style={{ alignItems: 'center' }}>
          <UI.Info size={18} color={c.gold} weight="bold" />
          <Txt role="body" style={{ flex: 1 }}>
            Blocked in system settings
          </Txt>
          <PillButton label="Open settings" kind="ghost" onPress={() => void openNotificationSettings()} />
        </Row>
      );
    }
    return (
      <PillButton
        label="Allow notifications"
        Leading={UI.Bell}
        color={c.green}
        onPress={() => {
          void requestPermission().then(refresh);
        }}
      />
    );
  };

  return (
    <Card>
      <View style={{ paddingVertical: 12, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt role="title2" heading>Reminders</Txt>
            <Txt role="footnote" tone="secondary">
              Movement, water, timed habits and the weekly summary
            </Txt>
          </View>
          <Switch value={s.remindersEnabled} onValueChange={(remindersEnabled) => actions.updateSettings({ remindersEnabled, offUntil: undefined })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Reminders" />
        </Row>
        {s.remindersEnabled ? permissionRow() : null}
        {perm === 'granted' && Platform.OS === 'android' && exact === false ? (
          <Row gap={8} style={{ alignItems: 'center' }}>
            <UI.Info size={16} color={c.gold} weight="bold" />
            <Txt role="caption" tone="secondary" style={{ flex: 1 }}>
              Without "Alarms & reminders" for this app, Android may deliver reminders minutes late, longer while the phone sleeps. Allowing it lets them ring closer to the planned minute; battery settings can still delay them.
            </Txt>
          </Row>
        ) : perm === 'granted' && Platform.OS === 'android' && exact === null ? (
          <Txt role="caption" tone="secondary">
            Exact timing lets reminders ring closer to the planned minute; without it they can arrive minutes late, longer while the phone sleeps. Battery settings can still delay them.
          </Txt>
        ) : null}
        {health.failure ? (
          <Row gap={8} style={{ alignItems: 'center' }}>
            <UI.Info size={16} color={c.danger} weight="bold" />
            <Txt role="caption" tone="secondary" style={{ flex: 1 }}>
              {s.remindersEnabled
                ? `The last reminder update failed (${health.failure.message}). The schedule shown may be stale; the app retries on its own, and again when you return to it.`
                : `Some reminders could not be cancelled yet (${health.failure.message}); they may still ring. The app keeps trying, and again when you return to it.`}
            </Txt>
          </Row>
        ) : null}
      </View>

      {s.remindersEnabled && perm === 'granted' && NOTIFICATIONS_SUPPORTED ? (
        <>
          <Divider />
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <Txt role="title2" heading>Test</Txt>
            {testPhase === 'idle' ? (
              <>
                <Txt role="footnote" tone="secondary">
                  {testResult === 'ok'
                    ? 'The test reminder arrived. Reminders reach this phone.'
                    : testResult === 'missed'
                      ? 'The test reminder did not arrive. Check, then test again:'
                      : 'Not sure reminders reach this phone? Send one, lock the phone and wait a minute.'}
                </Txt>
                {testResult === 'missed'
                  ? REMINDER_TEST_CHECKS.map((line, i) => (
                      <Txt key={i} role="footnote" tone="secondary">
                        {i + 1}. {line}
                      </Txt>
                    ))
                  : null}
                {testError ? (
                  <Txt role="footnote" tone="danger">
                    {testError}
                  </Txt>
                ) : null}
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  <PillButton label={testBusy ? 'Scheduling…' : testResult ? 'Test again' : 'Send a test reminder'} Leading={UI.Bell} kind="ghost" disabled={testBusy} onPress={startTest} />
                  {testResult === 'missed' ? <PillButton label="Open app settings" kind="ghost" onPress={() => void openNotificationSettings()} /> : null}
                </Row>
              </>
            ) : test ? (
              <>
                <Txt role="body">{reminderTestLine(test, nowMs, zone, clock)}</Txt>
                {testError ? (
                  <Txt role="footnote" tone="danger">
                    {testError}
                  </Txt>
                ) : null}
                {testPhase === 'waiting' ? (
                  <Row gap={8}>
                    <PillButton label="Cancel the test" kind="ghost" onPress={stopTest} />
                  </Row>
                ) : (
                  <Row gap={8}>
                    <PillButton
                      label="Yes"
                      Leading={UI.Check}
                      onPress={() => {
                        setTest(null);
                        setTestResult('ok');
                      }}
                    />
                    <PillButton
                      label="No"
                      kind="ghost"
                      onPress={() => {
                        setTest(null);
                        setTestResult('missed');
                        // Past its minute the ring has fired or is late; a refused cancel is still said.
                        cancelTestRing().catch((err: unknown) => {
                          if (mounted.current) setTestError(`The test could not be cancelled (${errorText(err)}); it may still ring.`);
                        });
                      }}
                    />
                  </Row>
                )}
              </>
            ) : null}
          </View>
        </>
      ) : null}

      {s.remindersEnabled ? (
        <>
          <Divider />
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <Txt role="title2" heading>Pause</Txt>
            {paused ? (
              <Row gap={8} style={{ alignItems: 'center' }}>
                <UI.BellSlash size={18} color={c.violet} />
                <Txt role="body" style={{ flex: 1 }}>
                  Paused until {calendarDayOf(s.offUntil!, zone) === calendarDayOf(nowMs, zone) ? '' : `${calendarDayOf(s.offUntil!, zone)} `}
                  {formatClock(minutesOfDay(s.offUntil!, zone), clock)}
                </Txt>
                <PillButton label="Resume" kind="ghost" onPress={() => actions.updateSettings({ offUntil: undefined })} />
              </Row>
            ) : (
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {OFF_CHOICES.map((o) => (
                  <Chip key={o.label} label={o.label} Leading={o.hours === 72 ? UI.Airplane : undefined} onPress={() => o.hours !== null && pauseFor(o.hours)} />
                ))}
              </Row>
            )}
          </View>

          <Divider />
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Txt role="title2" heading>Weekly summary</Txt>
                <Txt role="footnote" tone="secondary">
                  {weekdayName(s.weeklySummary.weekday)}s — how the week went, in one line (the last day of your week)
                </Txt>
              </View>
              <Switch value={s.weeklySummary.enabled} onValueChange={(enabled) => actions.updateSettings({ weeklySummary: { ...s.weeklySummary, enabled } })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Weekly summary" />
            </Row>
            {s.weeklySummary.enabled ? (
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt role="body" tone="secondary">
                  At
                </Txt>
                <Stepper value={s.weeklySummary.minute} onChange={(minute) => actions.updateSettings({ weeklySummary: { ...s.weeklySummary, minute } })} step={30} min={8 * 60} max={21 * 60} label="weekly summary time" format={(m) => formatClock(m, clock)} parse={parseClockInput} />
              </Row>
            ) : null}
          </View>

          <Divider />
          <View style={{ paddingVertical: 12, gap: 6 }}>
            <Txt role="title2" heading>Next up</Txt>
            {plan.length === 0 ? (
              <Txt role="footnote" tone="secondary">
                Nothing planned right now — everything is done, paused, or outside active hours.
              </Txt>
            ) : (
              plan.slice(0, 4).map((n) => (
                <Txt key={n.id} role="body" tone="secondary">
                  {describeNudge(n, zone, nowMs, clock)}
                </Txt>
              ))
            )}
            {plan.length > 4 ? (
              <Txt role="caption" tone="secondary">
                +{plan.length - 4} more within 36 hours
              </Txt>
            ) : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}
