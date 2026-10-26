import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Switch, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Chip, Divider, PillButton, Row, Stepper } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { ScheduledNudge } from '@/src/domain/nudges/planner';
import { now } from '@/src/domain/time/clock';
import { formatClock, parseClockInput } from '@/src/domain/time/format';
import { calendarDayOf, instantOf, minutesOfDay } from '@/src/domain/time/trackingDay';
import { NOTIFICATIONS_SUPPORTED, exactAlarmsAllowed, getPermission, openExactAlarmSettings, openNotificationSettings, requestPermission, type PermissionState } from '@/src/services/notifications';
import { nudgePlan } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';

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

const OFF_CHOICES: { label: string; hours: number | 'day' | null }[] = [
  { label: '2 hours', hours: 2 },
  { label: 'Rest of today', hours: 'day' },
  { label: '3 days', hours: 72 },
];

function describeNudge(n: ScheduledNudge, zone: string, today: string): string {
  const dayLabel = n.day === today ? '' : n.day === calendarDayOf(now() + 86_400_000, zone) ? 'Tomorrow ' : `${n.day} `;
  return `${dayLabel}${formatClock(minutesOfDay(n.at, zone))} · ${n.title}`;
}

/** Settings → Reminders: master switch, permissions, off mode, weekly summary and a preview of what is scheduled. */
export function RemindersCard() {
  const c = useColors();
  const { state, actions, today, nowMs, zone } = useTracker();
  const s = state.settings;
  const [perm, exact, refresh] = useNotificationPermission();
  const plan = nudgePlan(state, today, nowMs, zone);
  const paused = s.offUntil !== undefined && s.offUntil > nowMs;

  const pauseFor = (hours: number | 'day') => {
    const until = hours === 'day' ? instantOf(calendarDayOf(nowMs, zone), s.activeEndMin, zone) : nowMs + hours * 3_600_000;
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
            <Txt role="title2">Reminders</Txt>
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
              Android is delivering reminders late: minutes, longer while the phone sleeps. Turn on "Alarms & reminders" for this app and they ring at the planned minute.
            </Txt>
          </Row>
        ) : perm === 'granted' && Platform.OS === 'android' && exact === null ? (
          <Txt role="caption" tone="secondary">
            Exact timing lets Android ring at the planned minute; without it nudges can arrive minutes late, longer while the phone sleeps.
          </Txt>
        ) : null}
      </View>

      {s.remindersEnabled ? (
        <>
          <Divider />
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <Txt role="title2">Pause</Txt>
            {paused ? (
              <Row gap={8} style={{ alignItems: 'center' }}>
                <UI.BellSlash size={18} color={c.violet} />
                <Txt role="body" style={{ flex: 1 }}>
                  Paused until {calendarDayOf(s.offUntil!, zone) === today ? '' : `${calendarDayOf(s.offUntil!, zone)} `}
                  {formatClock(minutesOfDay(s.offUntil!, zone))}
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
                <Txt role="title2">Weekly summary</Txt>
                <Txt role="footnote" tone="secondary">
                  Sundays — how the week went, in one line
                </Txt>
              </View>
              <Switch value={s.weeklySummary.enabled} onValueChange={(enabled) => actions.updateSettings({ weeklySummary: { ...s.weeklySummary, enabled } })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Weekly summary" />
            </Row>
            {s.weeklySummary.enabled ? (
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt role="body" tone="secondary">
                  At
                </Txt>
                <Stepper value={s.weeklySummary.minute} onChange={(minute) => actions.updateSettings({ weeklySummary: { ...s.weeklySummary, minute } })} step={30} min={8 * 60} max={21 * 60} label="weekly summary time" format={formatClock} parse={parseClockInput} />
              </Row>
            ) : null}
          </View>

          <Divider />
          <View style={{ paddingVertical: 12, gap: 6 }}>
            <Txt role="title2">Next up</Txt>
            {plan.length === 0 ? (
              <Txt role="footnote" tone="secondary">
                Nothing planned right now — everything is done, paused, or outside active hours.
              </Txt>
            ) : (
              plan.slice(0, 4).map((n) => (
                <Txt key={n.id} role="body" tone="secondary">
                  {describeNudge(n, zone, today)}
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
