/**
 * When a cycle reminder fires next (ported from Cadence's CycleReminderPlanner).
 * BEFORE_PERIOD rules count back from the expected start ("Vitamin C, five days
 * before"); PHASE_START rules count forward from the day a phase begins. A late
 * period suppresses every cycle reminder until the next start is logged.
 */
import type { CycleReminder, CyclePhaseKey } from '../models';
import { addDays } from '../time/trackingDay';
import type { CyclePrediction } from './timeline';

export interface ReminderFire {
  reminder: CycleReminder;
  day: string;
  minute: number;
}

export function phaseStartOf(prediction: CyclePrediction, phase: CyclePhaseKey): string {
  switch (phase) {
    case 'period':
      return prediction.nextStart;
    case 'fertile':
      return prediction.fertileStart;
    case 'luteal':
      return addDays(prediction.ovulation, 1);
  }
}

/**
 * The next calendar day a rule fires, today or later; null when the rule is off,
 * the period is late, or nothing is predicted. Once this cycle's day has passed,
 * the same rule is projected one cycle ahead.
 */
export function nextFireDay(rule: CycleReminder, prediction: CyclePrediction | null, today: string): string | null {
  if (!rule.enabled || !prediction) return null;
  if (prediction.lateDays > 0) return null;
  const base = rule.anchor === 'BEFORE_PERIOD' ? addDays(prediction.nextStart, -rule.offsetDays) : addDays(phaseStartOf(prediction, rule.phase ?? 'period'), rule.offsetDays);
  if (base >= today) return base;
  const next = addDays(base, prediction.cycleLength);
  return next >= today ? next : null;
}

/** Every enabled rule's next fire, soonest first. */
export function upcomingReminders(rules: readonly CycleReminder[], prediction: CyclePrediction | null, today: string): ReminderFire[] {
  const out: ReminderFire[] = [];
  for (const reminder of rules) {
    const day = nextFireDay(reminder, prediction, today);
    if (day) out.push({ reminder, day, minute: reminder.minute });
  }
  return out.sort((a, b) => (a.day === b.day ? a.minute - b.minute : a.day < b.day ? -1 : 1));
}

export function describeReminder(rule: CycleReminder): string {
  if (rule.anchor === 'BEFORE_PERIOD') {
    if (rule.offsetDays === 0) return 'On the expected first day';
    return `${rule.offsetDays} ${rule.offsetDays === 1 ? 'day' : 'days'} before the expected period`;
  }
  const phase = rule.phase === 'fertile' ? 'the fertile window' : rule.phase === 'luteal' ? 'the luteal phase' : 'the period';
  if (rule.offsetDays === 0) return `When ${phase} begins`;
  return `${rule.offsetDays} ${rule.offsetDays === 1 ? 'day' : 'days'} into ${phase}`;
}
