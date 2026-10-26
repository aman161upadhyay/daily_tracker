/**
 * The reminder self-test (Settings → Reminders → "Send a test reminder"): one ring scheduled a
 * minute out, so a person can lock the phone and see whether reminders reach it at all before
 * trusting a day of them. The phases and the words are pure; the card schedules the ring through
 * the notification service and asks the person what happened — the app cannot see its own
 * notification on a locked screen.
 */
import { formatClock, type ClockFormat } from '../time/format';
import { minutesOfDay } from '../time/trackingDay';

/** How far out the test ring is set: long enough to lock the phone, short enough to wait for. */
export const TEST_RING_LEAD_MS = 60_000;
/** How long after the due minute the card keeps saying "wait" before it asks whether the ring came. */
export const TEST_RING_GRACE_MS = 30_000;

export interface ReminderTest {
  /** When the ring was asked for. */
  dueAt: number;
}

export type ReminderTestPhase = 'idle' | 'waiting' | 'ask';

export function reminderTestPhase(test: ReminderTest | null, nowMs: number): ReminderTestPhase {
  if (!test) return 'idle';
  return nowMs < test.dueAt + TEST_RING_GRACE_MS ? 'waiting' : 'ask';
}

/** What the card says while the ring is pending, and the question once it should have come. */
export function reminderTestLine(test: ReminderTest, nowMs: number, zone: string, clock: ClockFormat): string {
  const at = formatClock(minutesOfDay(test.dueAt, zone), clock);
  return reminderTestPhase(test, nowMs) === 'waiting' ? `Lock the phone now. The test reminder is due at ${at}; it can take a minute or two.` : `Did the test reminder show up at ${at}?`;
}

/** What to check when the ring did not come, in the order that finds the cause most often. */
export const REMINDER_TEST_CHECKS: readonly string[] = [
  'Notifications are allowed for Daily Tracker, and its "Nudges" channel is not silenced.',
  'Battery: Settings → Apps → Daily Tracker → Battery → Unrestricted. Phones that "optimise" the app hold its alarms until the screen is on.',
  'Alarms & reminders is allowed for the app (the button above), so a ring is not pushed to the next maintenance window.',
  'Do Not Disturb and Focus modes can hide reminders; a test while one is on tells you nothing.',
];
