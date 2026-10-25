/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRESETS } from '../src/library/presets';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState } from '../src/state/seed';
import { habitDayValue, habitView, highlights, liveNudge, ruleFor, todaySummary, waterHabit } from '../src/state/selectors';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
// 2026-10-25 14:00 EDT
const NOW = Date.UTC(2026, 9, 25, 18, 0);

describe('sample data', () => {
  const state = buildSampleState(TODAY, ZONE, NOW);

  it('is deterministic and internally consistent', () => {
    const again = buildSampleState(TODAY, ZONE, NOW);
    assert.deepEqual(again, state);
    for (const h of state.habits) assert.ok(ruleFor(state, h.id, TODAY), `rule for ${h.name}`);
    for (const w of state.water) assert.ok(w.day <= TODAY && w.ml > 0);
    for (const s of state.snacks) assert.ok(s.day <= TODAY);
    assert.ok(state.settings.sampleData);
    assert.ok(state.settings.cycle.history.length >= 3);
  });

  it('derives water, snack and mind values from their own logs', () => {
    const water = waterHabit(state)!;
    const sum = state.water.filter((w) => w.day === TODAY).reduce((a, w) => a + w.ml, 0);
    assert.equal(habitDayValue(state, water, TODAY), sum);

    const squats = state.habits.find((h) => h.snackType === 'SQUATS' && h.presetId !== 'sugar-shield')!;
    const count = state.snacks.filter((s) => s.day === TODAY && s.type === 'SQUATS' && s.trigger !== 'SUGAR_SHIELD').length;
    assert.equal(habitDayValue(state, squats, TODAY), count);

    const med = state.habits.find((h) => h.mindKind === 'MEDITATION')!;
    const minutes = state.mind.filter((m) => m.day === TODAY && m.kind === 'MEDITATION').reduce((a, m) => a + m.minutes, 0);
    assert.equal(habitDayValue(state, med, TODAY), minutes);
  });

  it('builds views with adherence in range and a live nudge inside active hours', () => {
    for (const h of state.habits) {
      const v = habitView(state, h, TODAY);
      assert.ok(v.adherence >= 0 && v.adherence <= 1, h.name);
      assert.equal(v.ratios14.length, 14);
      assert.equal(v.ratios14[13]!.day, TODAY);
    }
    const summary = todaySummary(state, TODAY, NOW, ZONE);
    assert.ok(summary.snacksTarget > 0);
    assert.ok(summary.rings.hydration >= 0 && summary.rings.hydration <= 1);
    const nudge = liveNudge(state, TODAY, NOW, ZONE);
    assert.ok(nudge, 'a nudge is scheduled at 2 pm');
    assert.ok(nudge!.dueMin >= 14 * 60 && nudge!.dueMin < state.settings.activeEndMin);
    assert.ok(highlights(state, TODAY).length > 0);
  });
});

describe('reducer', () => {
  const base = buildEmptyState(TODAY);
  const water = waterHabit(base)!;

  it('keeps only the water habit on a fresh start', () => {
    assert.equal(base.habits.length, 1);
    assert.equal(base.habits[0]!.presetId, 'water');
    assert.equal(base.settings.sampleData, false);
  });

  it('adds and undoes water by recency, not insertion order', () => {
    let s = reducer(base, { type: 'ADD_WATER', entry: { id: 'a', at: 2000, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' } });
    s = reducer(s, { type: 'ADD_WATER', entry: { id: 'b', at: 1000, zone: ZONE, day: TODAY, ml: 500, source: 'MANUAL' } });
    assert.equal(habitDayValue(s, water, TODAY), 750);
    s = reducer(s, { type: 'UNDO_WATER', day: TODAY });
    assert.deepEqual(s.water.map((w) => w.id), ['b']);
    s = reducer(s, { type: 'UNDO_WATER', day: '2026-10-24' });
    assert.equal(s.water.length, 1, 'undo on another day is a no-op');
  });

  it('versions rule edits by effectiveFrom', () => {
    let s = reducer(base, { type: 'SET_RULE', rule: { habitId: water.id, effectiveFrom: '2026-10-01', cadence: 'DAILY', timesPerPeriod: 1, target: 2000, freezesPerMonth: 2 } });
    s = reducer(s, { type: 'SET_RULE', rule: { habitId: water.id, effectiveFrom: TODAY, cadence: 'DAILY', timesPerPeriod: 1, target: 2500, freezesPerMonth: 2 } });
    assert.equal(ruleFor(s, water.id, TODAY)!.target, 2500);
    assert.equal(ruleFor(s, water.id, '2026-10-24')!.target, 2000, 'history keeps the old target');
    s = reducer(s, { type: 'SET_RULE', rule: { habitId: water.id, effectiveFrom: TODAY, cadence: 'DAILY', timesPerPeriod: 1, target: 3000, freezesPerMonth: 2 } });
    assert.equal(s.rules.filter((r) => r.habitId === water.id && r.effectiveFrom === TODAY).length, 1, 'same-day edits replace, not stack');
    assert.equal(ruleFor(s, water.id, TODAY)!.target, 3000);
  });

  it('toggles yes/no entries and adds presets once', () => {
    const preset = PRESETS.find((p) => p.id === 'sunlight') ?? PRESETS.find((p) => p.type === 'YES_NO')!;
    const habit = { id: 'h1', name: preset.name, category: preset.category, type: 'YES_NO' as const, unit: '', icon: preset.icon, presetId: preset.id, createdDay: TODAY, archived: false, pinned: false };
    let s = reducer(base, {
      type: 'ADD_HABIT',
      habit,
      rule: { habitId: 'h1', effectiveFrom: TODAY, cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 2 },
      policy: { habitId: 'h1', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false },
    });
    const entry = { id: 'e1', habitId: 'h1', day: TODAY, at: NOW, zone: ZONE, value: 1, source: 'MANUAL' as const };
    s = reducer(s, { type: 'TOGGLE_ENTRY', entry });
    assert.equal(habitDayValue(s, habit, TODAY), 1);
    s = reducer(s, { type: 'TOGGLE_ENTRY', entry: { ...entry, id: 'e2' } });
    assert.equal(habitDayValue(s, habit, TODAY), 0);
  });

  it('tracks swaps per day and period spans', () => {
    let s = reducer(base, { type: 'SWAP', day: TODAY });
    s = reducer(s, { type: 'SWAP', day: TODAY });
    assert.deepEqual(s.nudgeSwap, { day: TODAY, offset: 2 });
    s = reducer(s, { type: 'SWAP', day: '2026-10-26' });
    assert.deepEqual(s.nudgeSwap, { day: '2026-10-26', offset: 1 });

    s = reducer(s, { type: 'PERIOD_START', day: TODAY });
    assert.deepEqual(s.settings.cycle.history, [{ start: TODAY }]);
    s = reducer(s, { type: 'PERIOD_END', day: '2026-10-29' });
    assert.deepEqual(s.settings.cycle.history, [{ start: TODAY, end: '2026-10-29' }]);
    assert.equal(reducer(s, { type: 'PERIOD_END', day: '2026-10-30' }), s, 'ending a closed period is a no-op');
  });
});
