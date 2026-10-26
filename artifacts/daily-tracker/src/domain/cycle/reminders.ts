/**
 * When a cycle reminder fires next (ported from Cadence's CycleReminderPlanner).
 * BEFORE_PERIOD rules count back from the expected start ("Vitamin C, five days
 * before"); PHASE_START rules count forward from the day a phase begins. A late
 * period suppresses every cycle reminder until the next start is logged.
 *
 * A fire is *confirmed* when the day it is counted from is known: a predicted
 * start (that is what "before the period" means), a phase of the current
 * projection, or a period that has been logged. "Two days into the period" of a
 * period that has not started yet is shown as upcoming but never scheduled —
 * the notification would otherwise ring on a phone that slept through the
 * re-plan while the period was late.
 */
import type { CycleReminder, CyclePhaseKey } from '../models';
import { addDays } from '../time/trackingDay';
import type { CyclePrediction } from './timeline';

export interface ReminderFire {
  reminder: CycleReminder;
  day: string;
  minute: number;
  /** False when the day depends on a period start that is not logged yet. */
  confirmed: boolean;
}

export interface ReminderContext {
  /** Hormonal birth control: there is no ovulation to count from, so fertile / luteal rules pause. */
  birthControl?: boolean;
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

/** True for rules counted from ovulation, which hormonal birth control suppresses. */
export function isOvulationBased(rule: CycleReminder): boolean {
  return rule.anchor === 'PHASE_START' && (rule.phase === 'fertile' || rule.phase === 'luteal');
}

/**
 * The next calendar day a rule fires, today or later, and whether that day is
 * confirmed; null when the rule is off, paused by birth control, the period is
 * late, or nothing is predicted. Once this cycle's day has passed, the same
 * rule is projected one cycle ahead.
 */
export function nextFire(rule: CycleReminder, prediction: CyclePrediction | null, today: string, context: ReminderContext = {}): { day: string; confirmed: boolean } | null {
  if (!rule.enabled || !prediction) return null;
  if (prediction.lateDays > 0) return null;
  if (context.birthControl && isOvulationBased(rule)) return null;
  if (rule.anchor === 'PHASE_START' && (rule.phase ?? 'period') === 'period' && rule.offsetDays > 0) {
    // Counted from a logged start while that period's day is still ahead …
    const logged = addDays(prediction.lastStart, rule.offsetDays);
    if (logged >= today) return { day: logged, confirmed: true };
    // … otherwise from the predicted one: shown, not scheduled, until the period is logged.
    return { day: addDays(prediction.nextStart, rule.offsetDays), confirmed: false };
  }
  const base = rule.anchor === 'BEFORE_PERIOD' ? addDays(prediction.nextStart, -rule.offsetDays) : addDays(phaseStartOf(prediction, rule.phase ?? 'period'), rule.offsetDays);
  if (base >= today) return { day: base, confirmed: true };
  const next = addDays(base, prediction.cycleLength);
  return next >= today ? { day: next, confirmed: true } : null;
}

/** The next calendar day a rule fires (confirmed or not), or null. */
export function nextFireDay(rule: CycleReminder, prediction: CyclePrediction | null, today: string, context: ReminderContext = {}): string | null {
  return nextFire(rule, prediction, today, context)?.day ?? null;
}

/** Every enabled rule's next fire, soonest first. */
export function upcomingReminders(rules: readonly CycleReminder[], prediction: CyclePrediction | null, today: string, context: ReminderContext = {}): ReminderFire[] {
  const out: ReminderFire[] = [];
  for (const reminder of rules) {
    const fire = nextFire(reminder, prediction, today, context);
    if (fire) out.push({ reminder, day: fire.day, minute: reminder.minute, confirmed: fire.confirmed });
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
