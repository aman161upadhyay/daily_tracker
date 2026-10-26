/**
 * Pace-aware water logic (kept from the Cadence design).
 *
 * Expected intake = goal × fraction of the active day elapsed. You are "on
 * pace" when logged + half a tap ≥ expected, and reminders are skipped
 * silently while on pace, so the app never nags someone who is already
 * drinking.
 */

export const DEFAULT_TAP_ML = 250;

export function expectedIntakeMl(
  nowMin: number,
  activeStartMin: number,
  activeEndMin: number,
  goalMl: number,
): number {
  if (activeEndMin <= activeStartMin) return goalMl;
  if (nowMin <= activeStartMin) return 0;
  if (nowMin >= activeEndMin) return goalMl;
  const fraction = (nowMin - activeStartMin) / (activeEndMin - activeStartMin);
  return Math.round(goalMl * fraction);
}

export function isOnPace(loggedMl: number, expectedMl: number, tapMl: number = DEFAULT_TAP_ML): boolean {
  return loggedMl + tapMl / 2 >= expectedMl;
}

/** How much would bring you back to pace, rounded up to a 50 ml step. */
export function catchUpMl(loggedMl: number, expectedMl: number): number {
  const gap = expectedMl - loggedMl;
  if (gap <= 0) return 0;
  return Math.ceil(gap / 50) * 50;
}

export function remainingMl(loggedMl: number, goalMl: number): number {
  return Math.max(0, goalMl - loggedMl);
}

export interface WaterStatus {
  loggedMl: number;
  goalMl: number;
  expectedMl: number;
  onPace: boolean;
  catchUpMl: number;
  remainingMl: number;
  reachedGoal: boolean;
}

export function waterStatus(
  loggedMl: number,
  goalMl: number,
  nowMin: number,
  activeStartMin: number,
  activeEndMin: number,
  tapMl?: number,
): WaterStatus {
  const expected = expectedIntakeMl(nowMin, activeStartMin, activeEndMin, goalMl);
  return {
    loggedMl,
    goalMl,
    expectedMl: expected,
    // Same tolerance as the planner's behind-pace check, so the card and the nudge never disagree.
    onPace: isOnPace(loggedMl, expected, tapMl),
    catchUpMl: catchUpMl(loggedMl, expected),
    remainingMl: remainingMl(loggedMl, goalMl),
    reachedGoal: loggedMl >= goalMl,
  };
}
