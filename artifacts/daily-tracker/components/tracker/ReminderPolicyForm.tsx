import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { NudgePolicy } from '@/src/domain/models';
import {
  POLICY_INTERVAL_MAX,
  POLICY_INTERVAL_MIN,
  POLICY_MAX_PER_DAY,
  POLICY_TIMES_MAX,
  WEEKDAY_LETTERS,
  clockMinutes,
  clockString,
  describePolicy,
  distinctTimeCount,
  durationText,
  normalizeWeekdays,
  policyFromDraft,
  policyModeOf,
  policyModesFor,
  type PolicyContext,
  type PolicyMode,
} from '@/src/domain/nudges/describePolicy';
import { formatClock, parseClockInput } from '@/src/domain/time/format';
import { weekStartIndex } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';
import { UI } from '../ui/icons';
import { IconButton, PillButton, Row, Segmented, Stepper } from '../ui/primitives';
import { Txt } from '../ui/Txt';

/** A time row keeps its key while its time is typed: a key made of the time would remount the field on every keystroke. */
export interface TimeRow {
  key: number;
  hhmm: string;
}
let rowSeq = 0;
const row = (hhmm: string): TimeRow => ({ key: ++rowSeq, hhmm });

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** What the form edits; `policyFromPolicyDraft` turns it into the stored policy. */
export interface PolicyDraft {
  mode: PolicyMode;
  times: TimeRow[];
  /** 0 = Monday … 6 = Sunday; all seven for every day. */
  weekdays: number[];
  intervalMin: number;
  onlyWhenBehind: boolean;
  maxPerDay: number;
}

/** The draft a policy opens on — the habit's own schedule, or the context's sensible default when it has none. */
export function policyDraftFrom(policy: NudgePolicy | undefined, ctx: PolicyContext): PolicyDraft {
  return {
    mode: policyModeOf(policy, ctx),
    times: policy?.times?.length ? policy.times.map(row) : [row('09:00')],
    weekdays: normalizeWeekdays(policy?.weekdays) ?? EVERY_DAY,
    intervalMin: policy?.intervalMin ?? (ctx.water ? 90 : 120),
    onlyWhenBehind: policy?.onlyWhenBehind ?? ctx.water,
    maxPerDay: policy && policy.maxPerDay >= 1 ? policy.maxPerDay : ctx.movement ? 6 : 3,
  };
}

/** The stored policy a draft describes, on top of the habit's existing one (its pause and hours are kept). */
export function policyFromPolicyDraft(base: Pick<NudgePolicy, 'habitId'> & Partial<NudgePolicy>, draft: PolicyDraft, ctx: PolicyContext): NudgePolicy {
  return policyFromDraft(base, { ...draft, times: draft.times.map((t) => t.hhmm) }, ctx);
}

/** The next free time after the last one: an hour later, else the first free quarter hour. */
function nextTime(times: string[]): string {
  const taken = new Set(times.map(clockMinutes).filter((m): m is number => m !== null));
  const last = Math.max(...[...taken], 8 * 60);
  for (let m = last + 60; m < 24 * 60; m += 60) if (!taken.has(m)) return clockString(m);
  for (let m = 0; m < 24 * 60; m += 15) if (!taken.has(m)) return clockString(m);
  return clockString(last);
}

export interface ReminderPolicyFormProps {
  draft: PolicyDraft;
  onChange: (next: PolicyDraft) => void;
  context: PolicyContext;
  /** The policy the draft would save as — shown as the summary line under the fields. */
  preview: NudgePolicy;
}

/**
 * The fields of a habit's reminder schedule: clock times on chosen days, an interval, the movement
 * rotation, or nothing; how many a day at most; whether it stays quiet while the habit is on pace.
 * Shared by the Reminders sheet on the habit page and the habit creation sheet, so a reminder set
 * while creating a habit is exactly the one the page would have saved.
 */
export function ReminderPolicyForm({ draft: d, onChange, context, preview }: ReminderPolicyFormProps) {
  const c = useColors();
  // The day boxes run from the person's first day of the week; the stored numbers stay Monday = 0.
  const weekStart = weekStartIndex(useTracker().state.settings.weekStart);
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  const set = (patch: Partial<PolicyDraft>) => onChange({ ...d, ...patch });
  const modes = policyModesFor(context);
  const times = d.times.map((t) => t.hhmm);
  const distinctTimes = distinctTimeCount(times);
  const setTime = (key: number, minute: number) => set({ times: d.times.map((t) => (t.key === key ? { ...t, hhmm: clockString(minute) } : t)) });
  // The last chosen day cannot be taken off: a schedule with no day is Off, which has its own mode.
  const toggleDay = (day: number) => set({ weekdays: d.weekdays.includes(day) ? (d.weekdays.length > 1 ? d.weekdays.filter((x) => x !== day) : d.weekdays) : [...d.weekdays, day].sort((a, b) => a - b) });

  return (
    <View>
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
            {weekdayOrder.map((day) => {
              const letter = WEEKDAY_LETTERS[day];
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
              {context.water ? 'The timer starts at your last drink and runs during your active hours.' : 'The timer starts at your last log and runs during your active hours.'}
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
            <Txt role="body">Only when I’m behind</Txt>
            <Txt role="footnote" tone="secondary">
              {d.mode === 'FIXED' ? 'Skipped once 60% of today’s target is logged.' : 'Skipped while the day is on pace for its target.'}
            </Txt>
          </View>
          <Switch value={d.onlyWhenBehind} onValueChange={(onlyWhenBehind) => set({ onlyWhenBehind })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Only when I’m behind" />
        </Row>
      ) : null}

      {d.mode !== 'NONE' && !context.water ? (
        <Row style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt role="body">Daily maximum</Txt>
            <Txt role="footnote" tone="secondary">
              The most this habit reminds you in a day. The overall cap in Settings → Reminders still applies.
            </Txt>
          </View>
          {/* Shows the value that will be saved (the preview's): set times cannot ring more often than there are distinct times. */}
          <Stepper value={preview.maxPerDay >= 1 ? preview.maxPerDay : d.maxPerDay} onChange={(maxPerDay) => set({ maxPerDay })} min={1} max={d.mode === 'FIXED' ? Math.max(1, distinctTimes) : POLICY_MAX_PER_DAY} label="reminders a day" />
        </Row>
      ) : null}

      <Txt role="footnote" tone="tertiary" style={{ marginTop: 12 }}>
        {describePolicy(preview, context)}
        {d.mode === 'FIXED' ? ' · Set times ring even outside your active hours; once the day is done they stay quiet.' : ''}
      </Txt>
    </View>
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
