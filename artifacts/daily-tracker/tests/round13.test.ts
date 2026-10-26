/**
 * Round 13: the activity list behind a habit's figures (what can be taken back), month helpers
 * for the day picker, safe preset lookups for untrusted ids, the lock state, and the record
 * versions that a replace moves.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { habitActivity } from '../src/domain/habits/activity';
import { daysInMonth, monthCells, monthOf, monthTitle, shiftMonth } from '../src/domain/time/month';
import { PRESET_BY_ID, presetById } from '../src/library/presets';
import { isAppLocked, setAppLocked } from '../src/services/lockState';
import { JsonStore, MemoryBackend } from '../src/data/jsonStore';
import { recordVersion } from '../src/data/store';
import { buildEmptyState, habitFromPreset } from '../src/state/seed';
import { reducer } from '../src/state/reducer';
import type { TrackerState } from '../src/state/types';

const TODAY = '2026-10-26';
const YESTERDAY = '2026-10-25';
const ZONE = 'America/New_York';
const NOON = Date.UTC(2026, 9, 26, 16, 0, 0); // 12:00 New York

function withPreset(state: TrackerState, presetId: string, id: string): TrackerState {
  const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID[presetId]!, id, '2026-09-01');
  return { ...state, habits: [...state.habits, habit], rules: [...state.rules, rule], policies: [...state.policies, policy] };
}

describe('habit activity', () => {
  const base = buildEmptyState(TODAY);
  const water = base.habits.find((h) => h.presetId === 'water')!;

  it('lists drinks newest first with their origin; imported ones are not removable', () => {
    const s: TrackerState = {
      ...base,
      water: [
        { id: 'a', at: NOON - 3_600_000, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' },
        { id: 'b', at: NOON, zone: ZONE, day: TODAY, ml: 330, source: 'AUTO_WIDGET' },
        { id: 'c', at: NOON - 1_800_000, zone: ZONE, day: TODAY, ml: 500, source: 'AUTO_HC', externalId: 'hc1' },
        { id: 'd', at: NOON - 86_400_000, zone: ZONE, day: YESTERDAY, ml: 200, source: 'MANUAL' },
      ],
    };
    const rows = habitActivity(s, water, [TODAY], 'ml');
    assert.deepEqual(
      rows.map((r) => [r.id, r.amount, r.via, r.removable]),
      [
        ['b', '330 ml', 'widget', true],
        ['c', '500 ml', 'Health Connect', false],
        ['a', '250 ml', undefined, true],
      ],
    );
    assert.equal(habitActivity(s, water, [TODAY, YESTERDAY], 'oz').length, 4, 'more days, more rows');
    assert.equal(habitActivity(s, water, [TODAY, YESTERDAY], 'oz')[3]!.amount, '6.8 oz', 'in the chosen units');
    assert.ok(rows.every((r) => r.log === 'water'));
  });

  it('gives a movement habit its own snacks and the Sugar Shield its rounds', () => {
    let s = withPreset(base, 'squat-snack', 'h_sq');
    s = withPreset(s, 'sugar-shield', 'h_ss');
    s = {
      ...s,
      snacks: [
        { id: 's1', at: NOON, zone: ZONE, day: TODAY, type: 'SQUATS', reps: 10, trigger: 'NUDGE' },
        { id: 's2', at: NOON + 60_000, zone: ZONE, day: TODAY, type: 'SQUATS', reps: 12, trigger: 'SUGAR_SHIELD' },
        { id: 's3', at: NOON + 120_000, zone: ZONE, day: TODAY, type: 'WALK', seconds: 300, trigger: 'SUGAR_SHIELD' },
        { id: 's4', at: NOON + 180_000, zone: ZONE, day: TODAY, type: 'CALF_RAISES', seconds: 90, trigger: 'WIDGET' },
      ],
    };
    const squats = s.habits.find((h) => h.id === 'h_sq')!;
    const shield = s.habits.find((h) => h.id === 'h_ss')!;
    assert.deepEqual(
      habitActivity(s, squats, [TODAY], 'ml').map((r) => [r.id, r.amount, r.via]),
      [['s1', '10 squats', 'reminder']],
    );
    assert.deepEqual(
      habitActivity(s, shield, [TODAY], 'ml').map((r) => [r.id, r.amount, r.via]),
      [
        ['s3', '5 min walk', 'Sugar Shield'],
        ['s2', '12 squats', 'Sugar Shield'],
      ],
    );
  });

  it('lists meditation sessions by their end and plain entries with a sign', () => {
    let s = withPreset(base, 'meditate', 'h_med');
    const custom = { id: 'h_pages', name: 'Read', category: 'mind' as const, type: 'COUNT' as const, unit: 'pages', icon: 'book' as const, createdDay: '2026-09-01', archived: false, pinned: false, sortOrder: 9 };
    s = {
      ...s,
      habits: [...s.habits, custom],
      mind: [{ id: 'm1', startAt: NOON - 600_000, endAt: NOON, zone: ZONE, day: TODAY, kind: 'MEDITATION', minutes: 10 }],
      entries: [
        { id: 'e1', habitId: 'h_pages', day: TODAY, at: NOON, zone: ZONE, value: 20, source: 'MANUAL' },
        { id: 'e2', habitId: 'h_pages', day: TODAY, at: NOON + 1, zone: ZONE, value: 5, source: 'AUTO_HC' },
        { id: 'e3', habitId: 'other', day: TODAY, at: NOON + 2, zone: ZONE, value: 5, source: 'MANUAL' },
      ],
    };
    const med = s.habits.find((h) => h.id === 'h_med')!;
    assert.deepEqual(
      habitActivity(s, med, [TODAY], 'ml').map((r) => [r.id, r.at, r.amount]),
      [['m1', NOON, '10 min meditation']],
    );
    const pages = habitActivity(s, s.habits.find((h) => h.id === 'h_pages')!, [TODAY], 'ml');
    assert.deepEqual(
      pages.map((r) => [r.id, r.amount, r.via, r.removable]),
      [
        ['e2', '+5 pages', 'Health Connect', false],
        ['e1', '+20 pages', undefined, true],
      ],
    );
  });

  it('is the list REMOVE_LOG works from: removing a row removes exactly that record', () => {
    const s: TrackerState = {
      ...base,
      water: [
        { id: 'a', at: NOON - 1000, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' },
        { id: 'b', at: NOON, zone: ZONE, day: TODAY, ml: 250, source: 'AUTO_WIDGET' },
      ],
    };
    const [newest] = habitActivity(s, water, [TODAY], 'ml');
    const after = reducer(s, { type: 'REMOVE_LOG', log: newest!.log, id: newest!.id });
    assert.deepEqual(
      after.water.map((w) => w.id),
      ['a'],
    );
  });
});

describe('month helpers', () => {
  it('shift, length, title and cells', () => {
    assert.equal(monthOf('2026-10-26'), '2026-10');
    assert.equal(shiftMonth('2026-10', -1), '2026-09');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-10', -22), '2024-12');
    assert.equal(daysInMonth('2026-02'), 28);
    assert.equal(daysInMonth('2028-02'), 29);
    assert.equal(daysInMonth('2026-10'), 31);
    assert.equal(monthTitle('2026-10'), 'October 2026');
    const cells = monthCells('2026-10'); // 1 October 2026 is a Thursday
    assert.equal(cells.length % 7, 0);
    assert.deepEqual(cells.slice(0, 4), [null, null, null, '2026-10-01']);
    assert.equal(cells.filter(Boolean).length, 31);
    assert.equal(cells[cells.length - 1], null, '31 October is a Saturday: Sunday is a blank');
    assert.equal(monthCells('2026-06')[0], '2026-06-01', 'a month that starts on Monday has no lead');
  });
});

describe('preset lookup', () => {
  it('answers only for real presets, never for inherited names', () => {
    assert.equal(presetById('water')?.id, 'water');
    assert.equal(presetById('no-such'), undefined);
    for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) assert.equal(presetById(bad), undefined, bad);
    assert.equal(presetById(undefined), undefined);
    assert.equal(presetById(42), undefined);
    assert.equal(presetById(''), undefined);
  });
});

describe('lock state', () => {
  it('publishes the gate and resets', () => {
    assert.equal(isAppLocked(), false);
    setAppLocked(true);
    assert.equal(isAppLocked(), true);
    setAppLocked(false);
    assert.equal(isAppLocked(), false);
  });
});

describe('record versions across a replace', () => {
  it('a "nothing yet" read before a replace cannot write after it, and racing writes do not both win', async () => {
    const store = new JsonStore(new MemoryBackend());
    await store.replace(buildEmptyState(TODAY));
    const before = await store.readRecord('r');
    assert.equal(before.value, null);
    await store.replace(buildEmptyState(TODAY));
    assert.equal(await store.writeRecord('r', 'old plan', before.version), null, 'the replace moved every version, this record included');
    const after = await store.readRecord('r');
    assert.equal(after.value, null);
    const v = await store.writeRecord('r', 'new plan', after.version);
    assert.equal(v, recordVersion(2, 'new plan'));
    const again = await store.readRecord('r');
    const winners = (await Promise.all([store.writeRecord('r', 'x', again.version), store.writeRecord('r', 'y', again.version), store.writeRecord('r', null, again.version)])).filter((w) => w !== null);
    assert.equal(winners.length, 1);
  });
});
