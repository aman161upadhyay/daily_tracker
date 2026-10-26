import { averageOf } from './stats';
import { lastNDays } from '@/src/domain/time/trackingDay';

/** What the Steps summary card shows (Body tab and Today's pinned card read the same figures). */
export interface StepsCardView {
  present: boolean;
  today: number;
  series7: number[];
  avg7: number | undefined;
}

/**
 * The card from the Steps habit's own log (hand-logged counts, by tracking day) when Health
 * Connect has nothing: the picker promises "from Health Connect, or the Steps habit", and a person
 * who types their steps in has a card to show for it. Present whenever the habit exists — a day at
 * 0 of the goal is a figure, not an absence.
 */
export function stepsCardViewFromHabit(valueOn: (day: string) => number, today: string): StepsCardView {
  const days = lastNDays(today, 7);
  const series7 = days.map((d) => valueOn(d));
  return { present: true, today: valueOn(today), series7, avg7: averageOf(series7) };
}
