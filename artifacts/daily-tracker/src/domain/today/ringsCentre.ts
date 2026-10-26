/**
 * What the centre of Today's rings says. The morning centre is the water still to drink and the
 * afternoon's the snack count — for the person who tracks those. "Start empty" archives the Water
 * habit, and a vitamins-only person has no movement target: neither is owed "2,000 ml to go" by a
 * goal they never chose, nor "0 snacks" for snacks they never planned. The centre then names the
 * nearest thing they do track, and with nothing tracked, says so.
 */
export interface RingsCentreInput {
  beforeNoon: boolean;
  tracksWater: boolean;
  tracksMovement: boolean;
  tracksMind: boolean;
  /** Water still to drink, already formatted in the person's units. */
  remaining: { value: string; unit: string };
  snacksDone: number;
  mindMinutes: string;
  habitCount: number;
}

export function ringsCentre(i: RingsCentreInput): { value: string; label: string } {
  if (i.beforeNoon && i.tracksWater) return { value: i.remaining.value, label: `${i.remaining.unit} to go` };
  if (i.tracksMovement) return { value: String(i.snacksDone), label: i.snacksDone === 1 ? 'snack' : 'snacks' };
  if (i.tracksWater) return { value: i.remaining.value, label: `${i.remaining.unit} to go` };
  if (i.tracksMind) return { value: i.mindMinutes, label: 'min of mind' };
  if (i.habitCount > 0) return { value: String(i.habitCount), label: i.habitCount === 1 ? 'habit' : 'habits' };
  return { value: '–', label: 'nothing tracked' };
}
