/**
 * The live "next movement snack" computation for the Today screen.
 *
 * This is the on-screen half of the nudge engine: one rotating interval slot
 * inside active hours that cycles through the snacks the user enabled. The
 * notification half (scheduled alarms with Done / Snooze / Swap actions)
 * comes in M2 and reuses these functions.
 */
import type { SnackType } from '../models';

export interface RotationItem {
  habitId: string;
  snackType: SnackType;
  label: string;
}

export interface NextNudge {
  /** Minutes after midnight when the nudge is due; `nowMin` when it is already due. */
  dueMin: number;
  /** Minutes from now (0 = due now). */
  inMin: number;
  item: RotationItem;
}

export interface SlotInput {
  nowMin: number;
  activeStartMin: number;
  activeEndMin: number;
  intervalMin: number;
  /** Minutes after midnight of the last logged snack today, if any. */
  lastDoneMin?: number;
  /** Minutes after midnight until which the user snoozed, if any. */
  snoozedUntilMin?: number;
}

/** Due minute of the next slot, or null when the active day is over or has not started. */
export function nextSlotMin(input: SlotInput): number | null {
  const { nowMin, activeStartMin, activeEndMin, intervalMin, lastDoneMin, snoozedUntilMin } = input;
  if (intervalMin <= 0 || activeEndMin <= activeStartMin) return null;
  if (nowMin >= activeEndMin) return null;

  const anchor = lastDoneMin !== undefined ? Math.max(lastDoneMin, activeStartMin) : activeStartMin;
  let due = anchor + intervalMin;
  if (nowMin < activeStartMin) due = activeStartMin + intervalMin;
  if (snoozedUntilMin !== undefined && snoozedUntilMin > due) due = snoozedUntilMin;
  if (due < nowMin) due = nowMin;
  if (due >= activeEndMin) return null;
  return due;
}

/** Which snack is up next: the rotation advances once per completed snack today. */
export function nextRotationItem(items: RotationItem[], completedToday: number): RotationItem | null {
  if (items.length === 0) return null;
  const index = ((completedToday % items.length) + items.length) % items.length;
  return items[index] ?? null;
}

export function nextNudge(input: SlotInput, items: RotationItem[], completedToday: number): NextNudge | null {
  const item = nextRotationItem(items, completedToday);
  if (!item) return null;
  const dueMin = nextSlotMin(input);
  if (dueMin === null) return null;
  return { dueMin, inMin: Math.max(0, dueMin - input.nowMin), item };
}

/** Swap the suggested snack for the next one in the rotation. */
export function swapRotation(items: RotationItem[], current: RotationItem): RotationItem {
  const i = items.findIndex((x) => x.habitId === current.habitId);
  if (i < 0 || items.length < 2) return current;
  return items[(i + 1) % items.length] ?? current;
}
