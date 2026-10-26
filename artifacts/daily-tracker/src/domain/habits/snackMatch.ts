import type { Habit, MovementSnack } from '../models';

/**
 * Whether a logged snack belongs to a habit. The Sugar Shield owns every snack logged under its
 * trigger (whatever the movement was) and nothing else; a movement habit owns the snacks of its
 * type that were not a Sugar Shield round. One rule, used wherever snacks are counted or undone,
 * so an undo never removes a row the count did not include.
 */
export function snackCountsFor(habit: Pick<Habit, 'presetId' | 'snackType'>, snack: Pick<MovementSnack, 'type' | 'trigger'>): boolean {
  if (!habit.snackType) return false;
  if (habit.presetId === 'sugar-shield') return snack.trigger === 'SUGAR_SHIELD';
  return snack.type === habit.snackType && snack.trigger !== 'SUGAR_SHIELD';
}
