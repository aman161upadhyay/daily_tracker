/**
 * What a habit's reminder policy does, in one line, for the habit screen and the policy editor.
 * Pure: the same words describe a preset's default and whatever the person changed it to.
 */
import type { NudgePolicy } from '../models';
import { formatClock, formatDayShort, formatWeekdayShort, type ClockFormat } from '../time/format';
import { addDays, calendarDayOf, instantOf, minutesOfDay, weekdayOf } from '../time/trackingDay';

export interface PolicyContext {
  /** A movement snack: interval policies join the shared rotation instead of running alone. */
  movement: boolean;
  /** The Water preset: its reminders are pace checks between taps. */
  water: boolean;
  /** Settings → Reminders interval the rotation runs on. */
  rotationIntervalMin: number;
  /** How the times are written ("7:30 AM" or "07:30"). */
  clock: ClockFormat;
}

/** "90 min", "2 h", "1 h 30 min". */
export function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Clock minutes of a stored "HH:MM"; null for anything else. */
export function clockMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh <= 23 && mm <= 59 ? hh * 60 + mm : null;
}

/** Clock minutes back to the stored "HH:MM". */
export function clockString(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * How many different clock times a draft's rows name (two rows at 8:00 are one ring): the most a
 * set-times policy can ring in a day, which is what `policyFromDraft` clamps `maxPerDay` to.
 */
export function distinctTimeCount(times: readonly string[]): number {
  return new Set(times.map(clockMinutes).filter((m): m is number => m !== null)).size;
}

/** "7:30 AM", "8:00 AM and 7:00 PM", "8:00 AM, 12:30 PM and 7:00 PM" (or "07:30", "08:00 and 19:00"). */
export function timesText(times: readonly string[], clock: ClockFormat): string {
  const words = [...times]
    .map(clockMinutes)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)
    .map((m) => formatClock(m, clock));
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** Monday first, as the week view and `weekdayOf` count. */
export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** A weekday choice, sorted and unique; every day (or nothing chosen) reads as no restriction. */
export function normalizeWeekdays(days: readonly number[] | undefined): number[] | undefined {
  if (!days) return undefined;
  const out = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return out.length === 0 || out.length === 7 ? undefined : out;
}

/** "on weekdays", "at weekends", "on Mon, Wed and Fri"; empty for every day. */
export function weekdaysText(days: readonly number[] | undefined): string {
  const d = normalizeWeekdays(days);
  if (!d) return '';
  if (d.join() === '0,1,2,3,4') return 'on weekdays';
  if (d.join() === '5,6') return 'at weekends';
  const names = d.map((i) => WEEKDAY_NAMES[i]);
  return names.length === 1 ? `on ${names[0]}` : `on ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The schedule a policy asks for, whether or not it is switched on. */
export function describePolicy(policy: NudgePolicy | undefined, ctx: PolicyContext): string {
  if (!policy || policy.kind === 'NONE') return 'No reminder set';
  const cap = policy.maxPerDay >= 1 ? ` · up to ${policy.maxPerDay} a day` : '';
  switch (policy.kind) {
    case 'FIXED': {
      const times = (policy.times ?? []).filter((t) => clockMinutes(t) !== null);
      if (times.length === 0) return 'No times set';
      const behind = policy.onlyWhenBehind ? ' when behind' : '';
      const days = weekdaysText(policy.weekdays);
      return `At ${timesText(times, ctx.clock)}${days ? ` ${days}` : ''}${behind}${times.length > policy.maxPerDay && policy.maxPerDay >= 1 ? cap : ''}`;
    }
    case 'INTERVAL':
    case 'ROTATION': {
      if (ctx.water) return `A pace check every ${durationText(policy.intervalMin ?? 90)} when you are behind`;
      if (ctx.movement) return `In the movement rotation, about every ${durationText(ctx.rotationIntervalMin)}${cap}`;
      const behind = policy.onlyWhenBehind ? ' while behind pace' : '';
      return `Every ${durationText(policy.intervalMin ?? 60)}${behind}${cap}`;
    }
    case 'EVENT':
      return 'On demand: the card schedules its own follow-up';
    case 'CYCLE':
      return 'Set in the Cycle tab';
    default:
      return 'No reminder set';
  }
}

/**
 * The reminder in a few words for a row's subline ("At 7:30 AM", "At 8:00 AM +2 on weekdays",
 * "Every 90 min when behind", "Rotation"), from the habit's own policy — so a changed reminder,
 * a custom habit and the 24-hour clock all read right. Undefined when there is nothing to say.
 */
export function shortPolicyText(policy: NudgePolicy | undefined, ctx: PolicyContext): string | undefined {
  if (!policy || policy.kind === 'NONE') return undefined;
  switch (policy.kind) {
    case 'FIXED': {
      const minutes = (policy.times ?? []).map(clockMinutes).filter((m): m is number => m !== null);
      if (minutes.length === 0) return undefined;
      const distinct = [...new Set(minutes)].sort((a, b) => a - b);
      const days = weekdaysText(policy.weekdays);
      const more = distinct.length > 1 ? ` +${distinct.length - 1}` : '';
      return `At ${formatClock(distinct[0], ctx.clock)}${more}${days ? ` ${days}` : ''}`;
    }
    case 'INTERVAL':
    case 'ROTATION':
      if (ctx.water) return `Every ${durationText(policy.intervalMin ?? 90)} when behind`;
      if (ctx.movement) return 'Rotation';
      return `Every ${durationText(policy.intervalMin ?? 60)}${policy.onlyWhenBehind ? ' when behind' : ''}`;
    case 'EVENT':
      return 'On demand';
    case 'CYCLE':
      return 'Cycle';
    default:
      return undefined;
  }
}

/** The choices the editor offers a habit, in order. */
export type PolicyMode = 'NONE' | 'FIXED' | 'INTERVAL' | 'ROTATION';

export function policyModesFor(ctx: Pick<PolicyContext, 'movement' | 'water'>): { value: PolicyMode; label: string }[] {
  if (ctx.water) {
    return [
      { value: 'INTERVAL', label: 'Pace checks' },
      { value: 'NONE', label: 'Off' },
    ];
  }
  if (ctx.movement) {
    return [
      { value: 'ROTATION', label: 'Rotation' },
      { value: 'FIXED', label: 'Set times' },
      { value: 'NONE', label: 'Off' },
    ];
  }
  return [
    { value: 'FIXED', label: 'Set times' },
    { value: 'INTERVAL', label: 'Every so often' },
    { value: 'NONE', label: 'Off' },
  ];
}

/** The mode a stored policy is shown under (a movement habit's INTERVAL is the rotation). */
export function policyModeOf(policy: NudgePolicy | undefined, ctx: Pick<PolicyContext, 'movement' | 'water'>): PolicyMode {
  if (!policy || policy.kind === 'NONE' || policy.kind === 'EVENT' || policy.kind === 'CYCLE') return 'NONE';
  if (policy.kind === 'FIXED') return ctx.water ? 'INTERVAL' : 'FIXED';
  return ctx.movement ? 'ROTATION' : 'INTERVAL';
}

export const POLICY_TIMES_MAX = 8;
export const POLICY_INTERVAL_MIN = 15;
export const POLICY_INTERVAL_MAX = 8 * 60;
export const POLICY_MAX_PER_DAY = 12;

/** A schedule that is kept but not running: the switch on the habit page is off. */
export const isPaused = (policy: Partial<NudgePolicy> | undefined): boolean => !!policy && policy.kind !== undefined && policy.kind !== 'NONE' && policy.enabled === false;

/**
 * A policy as the editor saved it, normalised: times sorted and unique, numbers inside the bounds
 * the validator accepts. Off is a policy that never fires. A paused schedule that is edited stays
 * paused — Save changes the schedule, the switch on the habit page resumes it — so an unchanged
 * editor saved by habit does not quietly turn reminders back on.
 */
export function policyFromDraft(
  base: Pick<NudgePolicy, 'habitId'> & Partial<NudgePolicy>,
  draft: { mode: PolicyMode; times: string[]; weekdays?: readonly number[]; intervalMin: number; onlyWhenBehind: boolean; maxPerDay: number },
  ctx: Pick<PolicyContext, 'movement' | 'water'>,
): NudgePolicy {
  const times = [...new Set(draft.times.map(clockMinutes).filter((m): m is number => m !== null))].sort((a, b) => a - b).map(clockString);
  // (times.length === distinctTimeCount(draft.times): the stepper in the form shares that bound.)
  const intervalMin = Math.min(POLICY_INTERVAL_MAX, Math.max(POLICY_INTERVAL_MIN, Math.round(draft.intervalMin)));
  const maxPerDay = Math.min(POLICY_MAX_PER_DAY, Math.max(1, Math.round(draft.maxPerDay)));
  const kind = draft.mode === 'NONE' ? 'NONE' : draft.mode === 'FIXED' ? 'FIXED' : ctx.movement ? 'ROTATION' : 'INTERVAL';
  const out: NudgePolicy = {
    habitId: base.habitId,
    kind,
    onlyWhenBehind: kind === 'FIXED' || kind === 'INTERVAL' ? draft.onlyWhenBehind : false,
    maxPerDay: kind === 'NONE' ? 0 : kind === 'FIXED' ? Math.max(1, Math.min(maxPerDay, Math.max(1, times.length))) : maxPerDay,
    enabled: kind !== 'NONE' && !isPaused(base),
  };
  if (kind === 'FIXED') {
    out.times = times;
    const weekdays = normalizeWeekdays(draft.weekdays);
    if (weekdays) out.weekdays = weekdays;
  }
  if (kind === 'INTERVAL' || kind === 'ROTATION') out.intervalMin = intervalMin;
  if (base.activeStartMin !== undefined) out.activeStartMin = base.activeStartMin;
  if (base.activeEndMin !== undefined) out.activeEndMin = base.activeEndMin;
  return out;
}

/** The planned notifications that concern a habit, as the habit page reads them. */
export interface PlannedRing {
  at: number;
  day: string;
  habitIds: readonly string[];
}

/**
 * When this habit next rings, read off the actual plan — not the policy's promise. "Next: today at
 * 4:00 PM" is what a person wants to know after setting a reminder; the policy line above it says
 * only what was asked for. Null when there is nothing to say (no policy, an on-demand one).
 */
export function nextRingText(args: {
  plan: readonly PlannedRing[];
  habitId: string;
  policy: NudgePolicy | undefined;
  remindersEnabled: boolean;
  today: string;
  zone: string;
  clock: ClockFormat;
  /** The instant the plan was made for; set times past the plan's horizon are read off the policy. */
  nowMs?: number;
  horizonMs?: number;
  /** Settings → Reminders "Pause": nothing rings before this instant. */
  offUntil?: number;
  doneToday: boolean;
  donePeriod: boolean;
  periodNoun: 'day' | 'week' | 'month';
}): string | null {
  const { policy } = args;
  if (!policy || policy.kind === 'NONE' || policy.kind === 'EVENT' || policy.kind === 'CYCLE') return null;
  if (!args.remindersEnabled) return 'Reminders are off in Settings → Reminders.';
  if (!policy.enabled) return 'Paused: nothing rings until the switch is on.';
  // "Today" and "tomorrow" by the calendar, as a person reads a clock: a 1:00 AM ring belongs to
  // the previous tracking day (the day turns at 3 AM) but is "tomorrow at 1:00 AM" at 11 PM.
  const dayWord = (at: number, day: string) => {
    if (args.nowMs === undefined) return day === args.today ? 'today' : day === addDays(args.today, 1) ? 'tomorrow' : formatWeekdayShort(day);
    const ringDay = calendarDayOf(at, args.zone);
    const nowDay = calendarDayOf(args.nowMs, args.zone);
    return ringDay === nowDay ? 'today' : ringDay === addDays(nowDay, 1) ? 'tomorrow' : formatWeekdayShort(ringDay);
  };
  if (args.offUntil !== undefined && args.nowMs !== undefined && args.offUntil > args.nowMs) {
    return `Paused until ${dayWord(args.offUntil, calendarDayOf(args.offUntil, args.zone))} at ${formatClock(minutesOfDay(args.offUntil, args.zone), args.clock)} (Settings → Reminders).`;
  }
  const next = args.plan.filter((n) => n.habitIds.includes(args.habitId)).sort((a, b) => a.at - b.at)[0];
  if (next) return `Next: ${dayWord(next.at, next.day)} at ${formatClock(minutesOfDay(next.at, args.zone), args.clock)}`;
  // A quota met for the week or month: nothing rings until the next period, whatever the times say.
  if (args.donePeriod && args.periodNoun !== 'day') return `Done for the ${args.periodNoun}: nothing more rings.`;
  // Set times on a chosen weekday can lie past the plan's horizon (a Friday session seen on
  // Tuesday); the policy says when, the plan will confirm it once the day is near enough.
  if (policy.kind === 'FIXED' && policy.times?.length && args.nowMs !== undefined) {
    const horizonEnd = args.nowMs + (args.horizonMs ?? 36 * 60 * 60_000);
    const days = policy.weekdays?.length ? policy.weekdays : EVERY_DAY;
    for (let i = 0; i < 8; i++) {
      const day = addDays(args.today, i);
      if (!days.includes(weekdayOf(day))) continue;
      for (const hhmm of policy.times) {
        const minute = clockMinutes(hhmm);
        if (minute === null) continue;
        const at = instantOf(day, minute, args.zone);
        if (at > horizonEnd) return `Next: ${formatWeekdayShort(day)}, ${formatDayShort(day)} at ${formatClock(minute, args.clock)}`;
      }
    }
  }
  if (args.doneToday) return 'Done for today: nothing more rings.';
  return 'Nothing planned for the rest of today or tomorrow (the daily cap or this habit’s limit may be spent).';
}
