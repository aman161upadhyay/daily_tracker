/**
 * Round 24: what the council's diff, thirty-day simulation and product-coherence lenses turned up.
 *
 * - The widget's automatic movement tile reads a met week the way Today does ("nothing due", done),
 *   never "0 of 0 snacks" under a full ring; a snack habit's own tile counts in its own unit.
 * - A paused reminder's row hint says "Paused", not the schedule it is not ringing.
 * - The global pause is described in one voice on Today and in Settings, as a real date and time.
 * - A young habit's adherence names the days it actually covers; the first week's water highlight
 *   averages over days that existed and waits for three of them.
 * - The Steps card knows where its figures came from, so it can open that history.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stepsCardViewFromHabit } from '../src/domain/body/stepsCard';
import { adherenceSpan } from '../src/domain/habits/progress';
import type { MovementSnack, NudgePolicy } from '../src/domain/models';
import { pausedUntilText, shortPolicyText } from '../src/domain/nudges/describePolicy';
import { instantOf } from '../src/domain/time/trackingDay';
import { newHabitAction, type HabitDraft } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { highlights, todaySummary } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';
import { ringLabel, widgetModel } from '../src/widget/model';

const NY = 'America/New_York';
const MON = '2026-10-26';
const TUE = '2026-10-27';

function movementHabit(cadence: 'WEEKLY' | 'DAILY', unit = 'walks'): TrackerState {
  const empty = buildEmptyState(MON, undefined, { withWater: false });
  const draft: HabitDraft = { name: 'Walk break', category: 'movement', type: 'COUNT', unit, icon: 'walk', cadence, timesPerPeriod: 1, target: cadence === 'DAILY' ? 4 : 1, freezesPerMonth: 0, pinned: false };
  const add = newHabitAction(draft, 'h', MON);
  return reducer(reducer(empty, { ...add, habit: { ...add.habit, snackType: 'WALK' as const } }), { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true } });
}
const snack = (id: string, day: string, minute: number): MovementSnack => ({ id, at: instantOf(day, minute, NY), zone: NY, day, type: 'WALK', seconds: 300, trigger: 'MANUAL' });

describe('the widget reads a met week like Today (R24-A1)', () => {
  it('the automatic movement tile says "nothing due" and is done, not "0 of 0 snacks" under a full ring', () => {
    const monday = reducer(movementHabit('WEEKLY'), { type: 'LOG_SNACKS', snacks: [snack('s1', MON, 12 * 60)] });
    const tile = widgetModel(monday, TUE, instantOf(TUE, 12 * 60, NY), NY).tiles.find((t) => t.kind === 'rotation');
    assert.ok(tile);
    assert.equal(tile.caption, 'nothing due');
    assert.equal(tile.value, '0');
    assert.equal(tile.ratio, 1);
    assert.equal(tile.done, true);
    assert.equal(ringLabel(tile), 'Walk break: 0 nothing due. Double-tap to log the next snack.');
    const summary = todaySummary(monday, TUE, instantOf(TUE, 12 * 60, NY), NY);
    assert.equal(summary.snacksSettled, true, 'the same state Today draws');
  });
  it('a day with a target reads "of N snacks"; a chosen snack habit counts in its own unit', () => {
    const base = movementHabit('DAILY');
    const auto = widgetModel(base, MON, instantOf(MON, 12 * 60, NY), NY).tiles.find((t) => t.kind === 'rotation');
    assert.equal(auto?.caption, 'of 4 snacks');
    assert.equal(auto?.done, false);
    const chosen = reducer(base, { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: ['h'] } });
    const own = widgetModel(chosen, MON, instantOf(MON, 12 * 60, NY), NY).tiles[0];
    assert.equal(own?.caption, 'of 4 walks', 'the habit unit, not "sets"');
    assert.equal(ringLabel(own!), 'Walk break: 0 of 4 walks. Double-tap to log it.');
  });
});

describe('a paused reminder says so in the row (S24-2)', () => {
  const ctx = { movement: true, water: false, rotationIntervalMin: 60, clock: '12h' as const };
  const rotation: NudgePolicy = { habitId: 'h', kind: 'ROTATION', enabled: true, maxPerDay: 4, onlyWhenBehind: false };
  it('"Rotation" while it rings, "Paused · Rotation" while it does not', () => {
    assert.equal(shortPolicyText(rotation, ctx), 'Rotation');
    assert.equal(shortPolicyText({ ...rotation, enabled: false }, ctx), 'Paused · Rotation');
    assert.equal(shortPolicyText({ ...rotation, kind: 'NONE', enabled: false }, ctx), undefined, 'off is not paused');
  });
});

describe('the global pause in one voice (UX24-3 / S24-1)', () => {
  const now = instantOf(MON, 9 * 60 + 30, NY);
  it('"until 3:30 PM" the same day, "until Oct 29, 9:00 AM" later, nothing once it passed', () => {
    assert.equal(pausedUntilText(instantOf(MON, 15 * 60 + 30, NY), now, NY, '12h'), 'until 3:30 PM');
    assert.equal(pausedUntilText(instantOf('2026-10-29', 9 * 60, NY), now, NY, '24h'), 'until Oct 29, 09:00');
    assert.equal(pausedUntilText(now - 1, now, NY, '12h'), undefined);
    assert.equal(pausedUntilText(undefined, now, NY, '12h'), undefined);
  });
});

describe('young habits name the days they cover (UX24-6)', () => {
  it('adherence: today only under three days, then the real span, capped at 14', () => {
    assert.deepEqual(adherenceSpan(MON, MON), { days: 1, label: "Today's progress" });
    assert.deepEqual(adherenceSpan(MON, TUE), { days: 2, label: "Today's progress" });
    assert.deepEqual(adherenceSpan(MON, '2026-10-28'), { days: 3, label: '3-day adherence' });
    assert.deepEqual(adherenceSpan(MON, '2026-11-08'), { days: 14, label: '14-day adherence' });
    assert.deepEqual(adherenceSpan(MON, '2027-01-01'), { days: 14, label: '14-day adherence' });
  });
  it('the water highlight waits for three days and averages over the days that existed', () => {
    const state = buildEmptyState(MON, undefined, { withWater: true });
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const drink = (s: TrackerState, day: string, ml: number) => reducer(s, { type: 'ADD_WATER', entry: { id: `w${day}`, at: instantOf(day, 10 * 60, NY), zone: NY, day, ml, source: 'MANUAL' } });
    const day1 = drink(state, MON, 250);
    assert.equal(highlights(day1, MON).find((h) => h.id === 'water-week'), undefined, 'one drink on day one is not a week');
    const day3 = drink(drink(day1, TUE, 500), '2026-10-28', 750);
    const h3 = highlights(day3, '2026-10-28').find((h) => h.id === 'water-week');
    assert.equal(h3?.title, 'You logged water 3 of your first 3 days');
    assert.equal(h3?.body, '500 ml a day on average so far.');
    assert.equal(h3?.series?.length, 3);
    assert.equal(h3?.habitId, water.id);
    const week = highlights(day3, '2026-11-01').find((h) => h.id === 'water-week');
    assert.equal(week?.title, 'You logged water 3 of the last 7 days', 'from day seven the week reads as before');
  });
});

describe('the Steps card knows its source (UX24-1)', () => {
  it('hand-logged steps are marked as the habit\u2019s own', () => {
    const view = stepsCardViewFromHabit(() => 4000, MON);
    assert.equal(view.source, 'habit');
    assert.equal(view.present, true);
  });
});
