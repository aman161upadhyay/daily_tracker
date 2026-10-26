import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Habit, NudgePolicy } from '@/src/domain/models';
import {
  POLICY_INTERVAL_MAX,
  POLICY_INTERVAL_MIN,
  POLICY_MAX_PER_DAY,
  POLICY_TIMES_MAX,
  WEEKDAY_LETTERS,
  clockMinutes,
  clockString,
  describePolicy,
  durationText,
  isPaused,
  normalizeWeekdays,
  policyFromDraft,
  policyModeOf,
  policyModesFor,
  type PolicyContext,
  type PolicyMode,
} from '@/src/domain/nudges/describePolicy';
import { formatClock, parseClockInput } from '@/src/domain/time/format';
import { UI } from '../ui/icons';
import { Divider, IconButton, PillButton, Row, Segmented, Stepper } from '../ui/primitives';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';

export interface ReminderPolicySheetProps {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
  policy: NudgePolicy | undefined;
  context: PolicyContext;
  onSave: (policy: NudgePolicy) => void;
}

/** A time row keeps its key while its time is typed: a key made of the time would remount the field on every keystroke. */
interface TimeRow {
  key: number;
  hhmm: string;
}
let rowSeq = 0;
const row = (hhmm: string): TimeRow => ({ key: ++rowSeq, hhmm });

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Draft {
  mode: PolicyMode;
  times: TimeRow[];
  /** 0 = Monday … 6 = Sunday; all seven for every day. */
  weekdays: number[];
  intervalMin: number;
  onlyWhenBehind: boolean;
  maxPerDay: number;
}

function draftFrom(policy: NudgePolicy | undefined, ctx: PolicyContext): Draft {
  return {
    mode: policyModeOf(policy, ctx),
    times: policy?.times?.length ? policy.times.map(row) : [row('09:00')],
    weekdays: normalizeWeekdays(policy?.weekdays) ?? EVERY_DAY,
    intervalMin: policy?.intervalMin ?? (ctx.water ? 90 : 120),
    onlyWhenBehind: policy?.onlyWhenBehind ?? ctx.water,
    maxPerDay: policy && policy.maxPerDay >= 1 ? policy.maxPerDay : ctx.movement ? 6 : 3,
  };
}

/** The next free time after the last one: an hour later, else the first free quarter hour. */
function nextTime(times: string[]): string {
  const taken = new Set(times.map(clockMinutes).filter((m): m is number => m !== null));
  const last = Math.max(...[...taken], 8 * 60);
  for (let m = last + 60; m < 24 * 60; m += 60) if (!taken.has(m)) return clockString(m);
  for (let m = 0; m < 24 * 60; m += 15) if (!taken.has(m)) return clockString(m);
  return clockString(last);
}

/**
 * Tune how a habit reminds: set clock times, an interval, the movement rotation, or nothing;
 * how many a day at most; whether it stays quiet while the habit is on pace. Any habit, preset or
 * custom — the presets only start with a sensible default.
 */
export function ReminderPolicySheet({ visible, onClose, habit, policy, context, onSave }: ReminderPolicySheetProps) {
  const c = useColors();
  const [d, setD] = useState<Draft>(() => draftFrom(policy, context));
  useEffect(() => {
    if (visible) setD(draftFrom(policy, context));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, policy]);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const modes = policyModesFor(context);
  const times = d.times.map((t) => t.hhmm);
  const preview = policyFromDraft({ habitId: habit.id, ...policy }, { ...d, times }, context);
  const paused = isPaused(policy) && d.mode !== 'NONE';
  const setTime = (key: number, minute: number) => set({ times: d.times.map((t) => (t.key === key ? { ...t, hhmm: clockString(minute) } : t)) });
  // The last chosen day cannot be taken off: a schedule with no day is Off, which has its own mode.
  const toggleDay = (day: number) => set({ weekdays: d.weekdays.includes(day) ? (d.weekdays.length > 1 ? d.weekdays.filter((x) => x !== day) : d.weekdays) : [...d.weekdays, day].sort((a, b) => a - b) });

  return (
    <Sheet visible={visible} title="Reminders" onClose={onClose}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 8 }}>
        {habit.name}
      </Txt>
      <Segmented<PolicyMode> options={modes} value={d.mode} onChange={(mode) => set({ mode })} />

      {d.mode === 'FIXED' ? (
        <View style={{ marginTop: 14 }}>
          {d.times.map((t, i) => (
            <Row key={t.key} style={styles.row}>
              <Txt role="body" style={{ flex: 1 }}>
                {i === 0 ? 'At' : 'and at'}
              </Txt>
              <Stepper value={clockMinutes(t.hhmm) ?? 9 * 60} onChange={(m) => setTime(t.key, m)} step={15} min={0} max={23 * 60 + 45} format={formatClock} parse={parseClockInput} label={`time ${i + 1}`} />
              {d.times.length > 1 ? <IconButton Glyph={UI.Trash} label={`Remove ${formatClock(clockMinutes(t.hhmm) ?? 0)}`} onPress={() => set({ times: d.times.filter((x) => x.key !== t.key) })} size={36} color={c.textSecondary} /> : null}
            </Row>
          ))}
          {d.times.length < POLICY_TIMES_MAX ? <PillButton label="Add a time" kind="ghost" compact Leading={UI.Plus} onPress={() => set({ times: [...d.times, row(nextTime(times))] })} /> : null}
          <Txt role="body" style={{ marginTop: 14 }}>
            On
          </Txt>
          <View style={styles.days} accessibilityLabel="Days of the week">
            {WEEKDAY_LETTERS.map((letter, day) => {
              const on = d.weekdays.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleDay(day)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={WEEKDAY_NAMES[day]}
                  hitSlop={4}
                  style={[styles.day, { backgroundColor: on ? c.green : 'transparent', borderColor: on ? c.green : c.hairline }]}
                >
                  <Txt role="callout" color={on ? c.onGreen : c.textSecondary} style={{ fontWeight: '600' }}>
                    {letter}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {d.mode === 'INTERVAL' ? (
        <Row style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt role="body">{context.water ? 'Check every' : 'Every'}</Txt>
            <Txt role="footnote" tone="secondary">
              {context.water ? 'Counted from your last drink, inside your active hours.' : 'Counted from your last log, inside your active hours.'}
            </Txt>
          </View>
          <Stepper value={d.intervalMin} onChange={(intervalMin) => set({ intervalMin })} step={15} min={POLICY_INTERVAL_MIN} max={POLICY_INTERVAL_MAX} format={durationText} label="interval" />
        </Row>
      ) : null}

      {d.mode === 'ROTATION' ? (
        <Txt role="footnote" tone="secondary" style={{ marginTop: 12 }}>
          Movement snacks take turns in one shared series, about every {durationText(context.rotationIntervalMin)} of your active day (the interval is in Settings → Reminders). Done advances the turn; Swap skips to the next snack.
        </Txt>
      ) : null}

      {(d.mode === 'FIXED' || d.mode === 'INTERVAL') && !context.water ? (
        <Row style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt role="body">Only when behind</Txt>
            <Txt role="footnote" tone="secondary">
              {d.mode === 'FIXED' ? 'Skipped once 60% of today’s target is logged.' : 'Skipped while the day is on pace for its target.'}
            </Txt>
          </View>
          <Switch value={d.onlyWhenBehind} onValueChange={(onlyWhenBehind) => set({ onlyWhenBehind })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Only when behind" />
        </Row>
      ) : null}

      {d.mode !== 'NONE' && !context.water ? (
        <Row style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt role="body">At most, a day</Txt>
            <Txt role="footnote" tone="secondary">
              Within the overall daily cap in Settings → Reminders.
            </Txt>
          </View>
          <Stepper value={d.maxPerDay} onChange={(maxPerDay) => set({ maxPerDay })} min={1} max={d.mode === 'FIXED' ? Math.max(1, d.times.length) : POLICY_MAX_PER_DAY} label="reminders a day" />
        </Row>
      ) : null}

      <Divider />
      <Txt role="footnote" tone="tertiary" style={{ marginTop: 10 }}>
        {describePolicy(preview, context)}
        {d.mode === 'FIXED' ? ' · Set times ring at their time, even outside your active hours; a day already done stays quiet.' : ''}
        {paused ? ' · Paused: Save keeps the schedule, the switch on the habit page turns it back on.' : ''}
      </Txt>

      <Row gap={8} style={{ marginTop: 16 }}>
        <PillButton label="Cancel" kind="ghost" onPress={onClose} />
        <PillButton
          label="Save"
          onPress={() => {
            onSave(preview);
            onClose();
          }}
          style={{ flex: 1 }}
        />
      </Row>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
