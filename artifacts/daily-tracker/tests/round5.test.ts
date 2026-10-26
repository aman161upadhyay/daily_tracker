/// <reference types="node" />
/**
 * Council round 5 regressions: the timer bell's payload survives its own parser, the same
 * meditation is never logged twice (screen clock and end bell), a cadence change starts a fresh
 * prorated segment everywhere (streak, card, widget), and a closed period's end can be moved
 * from the day sheet.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateStreak, periodRequired, segmentStartOn } from '../src/domain/habits/streaks';
import type { Habit, HabitRule, NudgePolicy } from '../src/domain/models';
import { parseClockInput } from '../src/domain/time/format';
import { instantOf } from '../src/domain/time/trackingDay';
import { applyAll, mindEndPayload, mindSessionExists, nextPeriodStart, nudgeResponseActions, parsePayload, ruleChangeActions, targetChangeActions, type CommandContext } from '../src/state/commands';
import { reducer, type Action } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { habitView, latestRule, ruleFor, rulesFor } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';
import { widgetModel } from '../src/widget/model';

const ZONE = 'America/New_York';
const TODAY = '2026-10-31';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r5-${++seq}` };

/** A yes/no habit with a rule history, plus the days it was done. */
function habitWith(createdDay: string, rules: Omit<HabitRule, 'habitId'>[], doneDays: string[]): { state: TrackerState; habit: Habit } {
  const habit: Habit = { id: 'h-r5', name: 'Stretch', category: 'movement', type: 'YES_NO', unit: '', icon: 'squat', createdDay, archived: false, pinned: false };
  const policy: NudgePolicy = { habitId: habit.id, kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false };
  const [first, ...rest] = rules;
  const actions: Action[] = [
    { type: 'ADD_HABIT', habit, rule: { habitId: habit.id, ...first! }, policy },
    ...rest.map((r): Action => ({ type: 'SET_RULE', rule: { habitId: habit.id, ...r } })),
    ...doneDays.map((day, i): Action => ({ type: 'ADD_ENTRY', entry: { id: `e-${i}`, habitId: habit.id, day, at: instantOf(day, 9 * 60, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } })),
  ];
  return { state: applyAll(buildEmptyState(createdDay), actions, reducer), habit };
}

const weekly = (effectiveFrom: string, timesPerPeriod: number): Omit<HabitRule, 'habitId'> => ({ effectiveFrom, cadence: 'WEEKLY', timesPerPeriod, target: 1, freezesPerMonth: 0 });
const monthly = (effectiveFrom: string, timesPerPeriod: number): Omit<HabitRule, 'habitId'> => ({ effectiveFrom, cadence: 'MONTHLY', timesPerPeriod, target: 1, freezesPerMonth: 0 });
const daily = (effectiveFrom: string): Omit<HabitRule, 'habitId'> => ({ effectiveFrom, cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 0 });

describe('the timer bell payload', () => {
  it('survives its own parser (no day: the logger derives it from the end instant)', () => {
    const payload = mindEndPayload(NOW, 10, 'MEDITATION');
    assert.deepEqual(parsePayload(payload), payload);
    assert.deepEqual(parsePayload(JSON.parse(JSON.stringify(payload))), payload);
  });

  it('is the only kind allowed without a day', () => {
    assert.equal(parsePayload({ nudgeId: 'rot:1', kind: 'ROTATION', habitIds: ['h'], day: '' }), null);
    assert.equal(parsePayload({ ...mindEndPayload(NOW, 10, 'MEDITATION'), day: 'tomorrow' }), null);
  });

  it('logs the session once, whichever end gets there first', () => {
    const state = buildEmptyState(TODAY);
    const bell = mindEndPayload(NOW, 10, 'MEDITATION');
    const first = nudgeResponseActions(state, bell, 'TAP', ctx);
    assert.equal(first.length, 1);
    const after = applyAll(state, first, reducer);
    assert.equal(after.mind.length, 1);
    assert.equal(after.mind[0]!.startAt, NOW - 10 * 60_000);
    // The screen's clock ran out a few hundred ms apart from the bell's instant: the same session.
    assert.ok(mindSessionExists(after, 'MEDITATION', NOW - 10 * 60_000 + 400));
    assert.ok(mindSessionExists(after, 'MEDITATION', NOW - 10 * 60_000 - 59_000));
    assert.deepEqual(nudgeResponseActions(after, mindEndPayload(NOW + 400, 10, 'MEDITATION'), 'TAP', ctx), []);
    // A different kind, or a session that started a minute later, is a new one.
    assert.equal(mindSessionExists(after, 'BREATHING', NOW - 10 * 60_000), false);
    assert.equal(mindSessionExists(after, 'MEDITATION', NOW - 10 * 60_000 + 61_000), false);
  });
});

describe('a cadence change starts a fresh, prorated segment', () => {
  it('weekly → monthly on a Monday: the first month is judged on its remaining days', () => {
    // Created on a Tuesday; weekly 3× until the monthly rule takes over on Monday 26 Oct 2026.
    const { state, habit } = habitWith('2026-09-01', [weekly('2026-09-01', 3), monthly('2026-10-26', 20)], ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
    assert.equal(segmentStartOn(rulesFor(state, habit.id), habit.createdDay, '2026-10-31'), '2026-10-26');
    assert.equal(segmentStartOn(rulesFor(state, habit.id), habit.createdDay, '2026-10-25'), '2026-09-01');
    const view = habitView(state, habit, TODAY);
    const open = view.periods.at(-1)!;
    assert.equal(open.cadence, 'MONTHLY');
    assert.equal(open.start, '2026-10-26');
    assert.equal(open.required, 4); // 20 × 6/31, not 20
    assert.equal(open.done, 4);
    assert.equal(open.status, 'MET');
    assert.equal(view.periodQuota, open.required);
    assert.equal(view.periodDone, open.done);
    assert.equal(view.todayRatio, 1);
  });

  it('weekly → monthly mid-week: the week finishes first, the month segment starts after it', () => {
    const { state, habit } = habitWith('2026-09-01', [weekly('2026-09-01', 3), monthly('2026-10-28', 20)], []);
    const rules = rulesFor(state, habit.id);
    assert.equal(segmentStartOn(rules, habit.createdDay, '2026-10-30'), '2026-09-01'); // still the weekly segment
    assert.equal(segmentStartOn(rules, habit.createdDay, '2026-11-02'), '2026-11-02');
    assert.equal(segmentStartOn(rules, habit.createdDay, '2026-11-25'), '2026-11-02');
    const view = habitView(state, habit, '2026-11-05');
    const open = view.periods.at(-1)!;
    assert.equal(open.start, '2026-11-02');
    assert.equal(open.required, 19); // 20 × 29/30
    assert.equal(view.periodQuota, 19);
    assert.equal(periodRequired(rules[1]!, '2026-11-05', '2026-11-02'), 19);
  });

  it('daily → weekly on a Thursday: the first week asks for its share of the days left', () => {
    const { state, habit } = habitWith('2026-10-01', [daily('2026-10-01'), weekly('2026-10-15', 3)], ['2026-10-15', '2026-10-16']);
    const rules = rulesFor(state, habit.id);
    assert.equal(segmentStartOn(rules, habit.createdDay, '2026-10-16'), '2026-10-15');
    assert.equal(segmentStartOn(rules, habit.createdDay, '2026-10-14'), '2026-10-01');
    const view = habitView(state, habit, '2026-10-16');
    const open = view.periods.at(-1)!;
    assert.equal(open.cadence, 'WEEKLY');
    assert.equal(open.required, 2); // 3 × 4/7
    assert.equal(view.periodQuota, 2);
    assert.equal(view.periodDone, 2);
    assert.equal(open.status, 'MET');
    // The engine's own result agrees with the selectors.
    const engine = evaluateStreak({ rules, valueOf: (d) => (['2026-10-15', '2026-10-16'].includes(d) ? 1 : 0), createdDay: habit.createdDay, today: '2026-10-16' });
    assert.equal(engine.periods.at(-1)!.required, 2);
  });

  it('the widget caption shows the prorated quota, not the rule’s full count', () => {
    // Created on a Thursday with a 5-days-a-week rhythm: 4 days left in the week → 3 asked for.
    const { state, habit } = habitWith('2026-10-29', [weekly('2026-10-29', 5)], ['2026-10-29']);
    const withTile = reducer(state, { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: [habit.id] } });
    const model = widgetModel(withTile, TODAY, NOW, ZONE);
    const tile = model.tiles.find((t) => t.kind === 'habit' && t.habitId === habit.id);
    assert.ok(tile);
    assert.equal(tile.caption, '1 of 3 days');
  });
});

describe('a closed period can be extended or shortened from a day', () => {
  it('moves the end of the period that started by that day', () => {
    const state = buildEmptyState(TODAY);
    const withSpan: TrackerState = { ...state, settings: { ...state.settings, cycle: { ...state.settings.cycle, history: [{ start: '2026-09-01', end: '2026-09-05' }] } } };
    const longer = reducer(withSpan, { type: 'UPDATE_PERIOD', start: '2026-09-01', patch: { end: '2026-09-07' } });
    assert.equal(longer.settings.cycle.history[0]!.end, '2026-09-07');
    const shorter = reducer(longer, { type: 'UPDATE_PERIOD', start: '2026-09-01', patch: { end: '2026-09-03' } });
    assert.equal(shorter.settings.cycle.history[0]!.end, '2026-09-03');
  });
});

describe('a typed clock time', () => {
  it('reads the usual ways of writing one', () => {
    assert.equal(parseClockInput('9'), 9 * 60);
    assert.equal(parseClockInput('9:30'), 9 * 60 + 30);
    assert.equal(parseClockInput('930'), 9 * 60 + 30);
    assert.equal(parseClockInput('0930'), 9 * 60 + 30);
    assert.equal(parseClockInput('21:15'), 21 * 60 + 15);
    assert.equal(parseClockInput('2115'), 21 * 60 + 15);
    assert.equal(parseClockInput('9:30 pm'), 21 * 60 + 30);
    assert.equal(parseClockInput('930p'), 21 * 60 + 30);
    assert.equal(parseClockInput('12 am'), 0);
    assert.equal(parseClockInput('12:05 PM'), 12 * 60 + 5);
    assert.equal(parseClockInput(' 7 A.M. '), 7 * 60);
  });

  it('refuses what is not a time', () => {
    for (const bad of ['', 'noon', '24:00', '9:60', '13 pm', '0 am', '99', '1234567', '9:3']) assert.equal(parseClockInput(bad), null, bad);
  });
});

describe('saving an edited rule', () => {
  // Monday 26 Oct 2026; a weekly 2× habit created in September.
  const DAY = '2026-10-26';
  const setup = () => habitWith('2026-09-01', [weekly('2026-09-01', 2)], []);
  const draft = (cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY', timesPerPeriod: number, target = 1) => ({ cadence, timesPerPeriod, target, freezesPerMonth: 0 });

  it('same cadence applies from today; a new cadence from the next period', () => {
    const { state, habit } = setup();
    assert.deepEqual(ruleChangeActions(state, habit, draft('WEEKLY', 3), DAY), [{ type: 'SET_RULE', rule: { habitId: habit.id, ...draft('WEEKLY', 3), effectiveFrom: DAY } }]);
    assert.deepEqual(ruleChangeActions(state, habit, draft('MONTHLY', 20), DAY), [{ type: 'SET_RULE', rule: { habitId: habit.id, ...draft('MONTHLY', 20), effectiveFrom: '2026-11-02' } }]);
    assert.deepEqual(ruleChangeActions(state, habit, draft('WEEKLY', 2), DAY), []);
    assert.equal(nextPeriodStart('MONTHLY', '2026-12-15'), '2027-01-01');
    assert.equal(nextPeriodStart('DAILY', '2026-10-31'), '2026-11-01');
  });

  it('a rhythm planned for later is replaced at its own start, or called off when the draft is today’s rule', () => {
    const { state, habit } = setup();
    const planned = applyAll(state, ruleChangeActions(state, habit, draft('MONTHLY', 20), DAY), reducer);
    assert.equal(latestRule(planned, habit.id)!.effectiveFrom, '2026-11-02');
    // Saving the pending plan again changes nothing.
    assert.deepEqual(ruleChangeActions(planned, habit, draft('MONTHLY', 20), DAY), []);
    // A different plan of another cadence takes the planned start, not a later one.
    assert.deepEqual(ruleChangeActions(planned, habit, draft('DAILY', 1), DAY), [{ type: 'SET_RULE', rule: { habitId: habit.id, ...draft('DAILY', 1), effectiveFrom: '2026-11-02' } }]);
    // Back to today's rule: the plan is dropped, no duplicate "from Nov 2: 2 days a week" row remains.
    const reverted = applyAll(planned, ruleChangeActions(planned, habit, draft('WEEKLY', 2), DAY), reducer);
    assert.equal(rulesFor(reverted, habit.id).length, 1);
    assert.equal(latestRule(reverted, habit.id)!.effectiveFrom, '2026-09-01');
    // A same-cadence change while a plan is pending applies today and supersedes the plan.
    const changed = applyAll(planned, ruleChangeActions(planned, habit, draft('WEEKLY', 4), DAY), reducer);
    assert.deepEqual(rulesFor(changed, habit.id).map((r) => [r.effectiveFrom, r.cadence, r.timesPerPeriod]), [['2026-09-01', 'WEEKLY', 2], [DAY, 'WEEKLY', 4]]);
  });

  it('a target change keeps today’s cadence and carries into the planned rhythm', () => {
    const { state, habit } = setup();
    const planned = applyAll(state, ruleChangeActions(state, habit, draft('MONTHLY', 20), DAY), reducer);
    const after = applyAll(planned, targetChangeActions(planned, habit, 3, DAY), reducer);
    assert.deepEqual(ruleFor(after, habit.id, DAY), { habitId: habit.id, ...draft('WEEKLY', 2, 3), effectiveFrom: DAY }); // not monthly from today
    assert.equal(latestRule(after, habit.id)!.target, 3);
    assert.equal(latestRule(after, habit.id)!.cadence, 'MONTHLY');
    assert.deepEqual(targetChangeActions(after, habit, 3, DAY), []);
  });

  it('never removes a habit’s last rule', () => {
    const { state, habit } = setup();
    assert.equal(reducer(state, { type: 'REMOVE_RULE', habitId: habit.id, effectiveFrom: '2026-09-01' }), state);
    assert.equal(reducer(state, { type: 'REMOVE_RULE', habitId: habit.id, effectiveFrom: '2026-10-01' }), state);
  });
});
