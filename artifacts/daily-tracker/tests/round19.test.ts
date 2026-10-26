/**
 * Round 19: a Library preset added with a reminder chosen in its sheet.
 *
 * The sheet embeds the same editor the habit page shows; `presetHabitAction` is the one place the
 * choice becomes state, so the rules live here: the preset's own reminder when nothing was chosen,
 * the chosen one re-addressed to the new habit, an on-demand preset's trigger kept whatever was
 * passed, and a weekly preset that was given days ringing only on those days.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NudgePolicy } from '../src/domain/models';
import { policyFromDraft } from '../src/domain/nudges/describePolicy';
import { addDays, instantOf, weekdayOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { presetHabitAction } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { nudgePlan } from '../src/state/selectors';

const DAY = '2026-10-26'; // a Monday
const NY = 'America/New_York';

describe('presetHabitAction', () => {
  it('keeps the preset reminder when none was chosen', () => {
    const a = presetHabitAction(PRESET_BY_ID['strength-session'], 'h1', DAY);
    assert.equal(a.habit.presetId, 'strength-session');
    assert.equal(a.rule.cadence, 'WEEKLY');
    assert.deepEqual({ kind: a.policy.kind, times: a.policy.times, habitId: a.policy.habitId, enabled: a.policy.enabled }, { kind: 'FIXED', times: ['18:00'], habitId: 'h1', enabled: true });
  });

  it('stores the chosen reminder, addressed to the new habit', () => {
    const chosen = policyFromDraft({ habitId: 'new' }, { mode: 'FIXED', times: ['07:00'], weekdays: [1, 3, 5], intervalMin: 120, onlyWhenBehind: false, maxPerDay: 1 }, { movement: false, water: false });
    const a = presetHabitAction(PRESET_BY_ID['stair-sprint'], 'h2', DAY, chosen);
    assert.equal(a.policy.habitId, 'h2');
    assert.deepEqual(a.policy.times, ['07:00']);
    assert.deepEqual(a.policy.weekdays, [1, 3, 5]);
    assert.equal(a.policy.enabled, true);
    // The habit and rule are the preset's regardless of the reminder.
    assert.equal(a.habit.name, PRESET_BY_ID['stair-sprint'].name);
    assert.equal(a.rule.timesPerPeriod, 3);
  });

  it('a chosen "Off" stores no reminder', () => {
    const off = policyFromDraft({ habitId: 'new' }, { mode: 'NONE', times: [], intervalMin: 60, onlyWhenBehind: false, maxPerDay: 1 }, { movement: false, water: false });
    const a = presetHabitAction(PRESET_BY_ID['meditate'], 'h3', DAY, off);
    assert.equal(a.policy.kind, 'NONE');
    assert.equal(a.policy.enabled, false);
    assert.equal(a.policy.habitId, 'h3');
  });

  it('an on-demand preset keeps its trigger whatever was passed', () => {
    const chosen: NudgePolicy = { habitId: 'new', kind: 'FIXED', times: ['09:00'], onlyWhenBehind: false, maxPerDay: 1, enabled: true };
    const a = presetHabitAction(PRESET_BY_ID['sugar-shield'], 'h4', DAY, chosen);
    assert.equal(a.policy.kind, 'EVENT');
    assert.equal(a.policy.habitId, 'h4');
  });

  it('a movement preset given a rotation choice joins the rotation', () => {
    const chosen = policyFromDraft({ habitId: 'new' }, { mode: 'ROTATION', times: [], intervalMin: 60, onlyWhenBehind: false, maxPerDay: 4 }, { movement: true, water: false });
    const a = presetHabitAction(PRESET_BY_ID['pushup-snack'], 'h5', DAY, chosen);
    assert.equal(a.policy.kind, 'ROTATION');
    assert.equal(a.policy.maxPerDay, 4);
  });
});

describe('a weekly preset added with chosen days', () => {
  const chosen = policyFromDraft({ habitId: 'new' }, { mode: 'FIXED', times: ['10:00'], weekdays: [1, 3, 5], intervalMin: 120, onlyWhenBehind: false, maxPerDay: 1 }, { movement: false, water: false });
  const state = reducer(reducer(buildEmptyState(DAY), presetHabitAction(PRESET_BY_ID['stair-sprint'], 'h', DAY, chosen)), { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true } });

  it('rings at the chosen time on a chosen day and not on the others', () => {
    for (let i = 0; i < 7; i++) {
      const day = addDays(DAY, i);
      const nowMs = instantOf(day, 6 * 60, NY); // 6 am that day
      const rings = nudgePlan(state, day, nowMs, NY).filter((n) => n.habitIds.includes('h') && n.kind === 'FIXED' && n.day === day);
      const chosenDay = [1, 3, 5].includes(weekdayOf(day));
      assert.equal(rings.length > 0, chosenDay, `${day} (weekday ${weekdayOf(day)}) should ${chosenDay ? '' : 'not '}ring`);
      if (chosenDay) assert.equal(new Date(rings[0].at).toLocaleTimeString('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' }), '10:00 AM');
    }
  });

  it('the same preset added without a choice rings on every day of the week until its quota is in', () => {
    const plain = reducer(reducer(buildEmptyState(DAY), presetHabitAction(PRESET_BY_ID['stair-sprint'], 'p', DAY)), { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true } });
    const days = [0, 1, 2, 3].map((i) => addDays(DAY, i));
    for (const day of days) {
      const rings = nudgePlan(plain, day, instantOf(day, 6 * 60, NY), NY).filter((n) => n.habitIds.includes('p') && n.day === day);
      assert.ok(rings.length > 0, `${day} rings without chosen days`);
    }
  });
});
