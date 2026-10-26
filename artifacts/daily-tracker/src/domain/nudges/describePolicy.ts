/**
 * What a habit's reminder policy does, in one line, for the habit screen and the policy editor.
 * Pure: the same words describe a preset's default and whatever the person changed it to.
 */
import type { NudgePolicy } from '../models';
import { formatClock } from '../time/format';

export interface PolicyContext {
  /** A movement snack: interval policies join the shared rotation instead of running alone. */
  movement: boolean;
  /** The Water preset: its reminders are pace checks between taps. */
  water: boolean;
  /** Settings → Reminders interval the rotation runs on. */
  rotationIntervalMin: number;
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

/** "7:30 AM", "8:00 AM and 7:00 PM", "8:00 AM, 12:30 PM and 7:00 PM". */
export function timesText(times: readonly string[]): string {
  const words = [...times]
    .map(clockMinutes)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)
    .map(formatClock);
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
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
      return `At ${timesText(times)}${behind}${times.length > policy.maxPerDay && policy.maxPerDay >= 1 ? cap : ''}`;
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

/**
 * A policy as the editor saved it, normalised: times sorted and unique, numbers inside the bounds
 * the validator accepts, and `enabled` following the mode (Off is a policy that never fires).
 */
export function policyFromDraft(
  base: Pick<NudgePolicy, 'habitId'> & Partial<NudgePolicy>,
  draft: { mode: PolicyMode; times: string[]; intervalMin: number; onlyWhenBehind: boolean; maxPerDay: number },
  ctx: Pick<PolicyContext, 'movement' | 'water'>,
): NudgePolicy {
  const times = [...new Set(draft.times.map(clockMinutes).filter((m): m is number => m !== null))].sort((a, b) => a - b).map(clockString);
  const intervalMin = Math.min(POLICY_INTERVAL_MAX, Math.max(POLICY_INTERVAL_MIN, Math.round(draft.intervalMin)));
  const maxPerDay = Math.min(POLICY_MAX_PER_DAY, Math.max(1, Math.round(draft.maxPerDay)));
  const kind = draft.mode === 'NONE' ? 'NONE' : draft.mode === 'FIXED' ? 'FIXED' : ctx.movement ? 'ROTATION' : 'INTERVAL';
  const out: NudgePolicy = {
    habitId: base.habitId,
    kind,
    onlyWhenBehind: kind === 'FIXED' || kind === 'INTERVAL' ? draft.onlyWhenBehind : false,
    maxPerDay: kind === 'NONE' ? 0 : kind === 'FIXED' ? Math.max(1, Math.min(maxPerDay, Math.max(1, times.length))) : maxPerDay,
    enabled: kind !== 'NONE',
  };
  if (kind === 'FIXED') out.times = times;
  if (kind === 'INTERVAL' || kind === 'ROTATION') out.intervalMin = intervalMin;
  if (base.activeStartMin !== undefined) out.activeStartMin = base.activeStartMin;
  if (base.activeEndMin !== undefined) out.activeEndMin = base.activeEndMin;
  return out;
}
