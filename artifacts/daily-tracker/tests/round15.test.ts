/**
 * Round 15: Undo puts exact records back (Remove and Clear day), the snapshot source obeys the
 * newest intent, the notification permission is read as Android 13 means it, the pinned Steps
 * card falls back to the Steps habit, and two render-thread costs stay memoised: a reminder edit
 * on one habit leaves the others' views, a body-only change leaves the plan.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stepsCardViewFromHabit } from '../src/domain/body/stepsCard';
import { MAX_RESTORE_RECORDS, dayRecords, findRecord, restorable } from '../src/domain/habits/records';
import type { MovementSnack, WaterEntry } from '../src/domain/models';
import { PRESET_BY_ID } from '../src/library/presets';
import { classifyPermission } from '../src/services/notificationPermission';
import { committedSource } from '../src/services/snapshotSync';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, habitFromPreset } from '../src/state/seed';
import { habitView, nudgePlan } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const TODAY = '2026-10-26';
const YESTERDAY = '2026-10-25';
const ZONE = 'America/New_York';
const NOON = Date.UTC(2026, 9, 26, 16, 0, 0); // 12:00 New York

function withPreset(state: TrackerState, presetId: string, id: string): TrackerState {
  const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID[presetId]!, id, '2026-09-01');
  return { ...state, habits: [...state.habits, habit], rules: [...state.rules, rule], policies: [...state.policies, policy] };
}

function drink(id: string, day: string, at: number, ml = 250): WaterEntry {
  return { id, at, zone: ZONE, day, ml, source: 'MANUAL' };
}

function snack(id: string, day: string, at: number, trigger: MovementSnack['trigger'] = 'MANUAL'): MovementSnack {
  return { id, at, zone: ZONE, day, type: 'SQUATS', reps: 10, trigger };
}

describe('undo: exact records back', () => {
  const base = withPreset(withPreset(buildEmptyState(TODAY), 'squat-snack', 'h_squat'), 'sugar-shield', 'h_shield');
  const water = base.habits.find((h) => h.presetId === 'water')!;
  const squat = base.habits.find((h) => h.id === 'h_squat')!;
  const shield = base.habits.find((h) => h.id === 'h_shield')!;
  const state: TrackerState = {
    ...base,
    water: [drink('w1', TODAY, NOON - 3_600_000), drink('w2', TODAY, NOON), drink('w3', YESTERDAY, NOON - 86_400_000)],
    snacks: [snack('s1', TODAY, NOON - 600_000), snack('s2', TODAY, NOON, 'SUGAR_SHIELD'), snack('s3', YESTERDAY, NOON - 86_400_000)],
  };

  it('lists exactly what Clear day removes, by the same rule as the counts', () => {
    assert.deepEqual(
      dayRecords(state, water, TODAY).map((r) => r.record.id),
      ['w1', 'w2'],
    );
    assert.deepEqual(dayRecords(state, squat, TODAY).map((r) => r.record.id), ['s1'], 'the Sugar Shield set is not the squat habit\u2019s');
    assert.deepEqual(dayRecords(state, shield, TODAY).map((r) => r.record.id), ['s2']);
    const cleared = reducer(state, { type: 'CLEAR_DAY', habit: water, day: TODAY });
    assert.deepEqual(cleared.water.map((w) => w.id), ['w3']);
    assert.equal(cleared.snacks, state.snacks, 'other logs untouched');
  });

  it('restores the cleared records exactly, once, and is a no-op the second time', () => {
    const gone = dayRecords(state, water, TODAY);
    const cleared = reducer(state, { type: 'CLEAR_DAY', habit: water, day: TODAY });
    const back = reducer(cleared, { type: 'RESTORE_LOGS', records: gone });
    assert.deepEqual(
      back.water.map((w) => w.id).sort(),
      ['w1', 'w2', 'w3'],
    );
    assert.equal(back.water.find((w) => w.id === 'w2'), state.water[1], 'the very same record object');
    const again = reducer(back, { type: 'RESTORE_LOGS', records: gone });
    assert.equal(again, back, 'nothing to put back a second time');
  });

  it('Remove + Undo round-trips one record, and a record listed twice comes back once', () => {
    const gone = findRecord(state, 'snack', 's1');
    assert.ok(gone && gone.log === 'snack');
    const removed = reducer(state, { type: 'REMOVE_LOG', log: 'snack', id: 's1' });
    assert.deepEqual(removed.snacks.map((s) => s.id), ['s2', 's3']);
    const back = reducer(removed, { type: 'RESTORE_LOGS', records: [gone, gone] });
    assert.deepEqual(back.snacks.map((s) => s.id).sort(), ['s1', 's2', 's3']);
  });

  it('skips an entry whose habit is gone (an erase or delete in between), and caps the batch', () => {
    const withSteps = withPreset(state, 'steps', 'h_steps');
    const entry = { id: 'e1', habitId: 'h_steps', day: TODAY, at: NOON, zone: ZONE, value: 4000, source: 'MANUAL' as const };
    const logged: TrackerState = { ...withSteps, entries: [entry] };
    const gone = dayRecords(logged, logged.habits.find((h) => h.id === 'h_steps')!, TODAY);
    assert.equal(gone.length, 1);
    const deleted = reducer(reducer(logged, { type: 'CLEAR_DAY', habit: logged.habits.find((h) => h.id === 'h_steps')!, day: TODAY }), { type: 'DELETE_HABIT', id: 'h_steps' });
    assert.equal(reducer(deleted, { type: 'RESTORE_LOGS', records: gone }), deleted, 'no orphan entry');
    const many = Array.from({ length: MAX_RESTORE_RECORDS + 5 }, (_, i) => ({ log: 'water' as const, record: drink(`x${i}`, TODAY, NOON - i) }));
    assert.equal(restorable(buildEmptyState(TODAY), many).length, MAX_RESTORE_RECORDS);
  });
});

describe('snapshot source: the newest intent decides', () => {
  const on = { ...buildEmptyState(TODAY), water: [drink('w1', TODAY, NOON)] };
  const committedOn: TrackerState = { ...on, settings: { ...on.settings, onboardingDone: true, cloudBackup: true } };
  const optedOut: TrackerState = { ...committedOn, settings: { ...committedOn.settings, cloudBackup: false } };

  it('hands over the committed state while the newest state still wants a backup', () => {
    const src = committedSource({ current: () => committedOn, committed: () => committedOn, replacePending: () => false });
    assert.equal(src(), committedOn);
  });

  it('stands down after an opt-out whose save is pending or failed, and during a pending replace', () => {
    const pending = committedSource({ current: () => optedOut, committed: () => committedOn, replacePending: () => false });
    assert.equal(pending(), null, 'the committed state still says "backup on"; the person said no');
    const replacing = committedSource({ current: () => committedOn, committed: () => committedOn, replacePending: () => true });
    assert.equal(replacing(), null);
  });
});

describe('notification permission as Android 13 means it', () => {
  it('fresh install: Expo says denied-but-askable, the runtime permission was never asked → ask', () => {
    assert.equal(classifyPermission({ status: 'denied', canAskAgain: true, runtimeGranted: false }), 'undetermined');
  });
  it('denied twice: no dialog left → blocked', () => {
    assert.equal(classifyPermission({ status: 'denied', canAskAgain: false, runtimeGranted: false }), 'denied');
  });
  it('permission held but notifications switched off in the app\u2019s settings → blocked (settings only)', () => {
    assert.equal(classifyPermission({ status: 'denied', canAskAgain: true, runtimeGranted: true }), 'denied');
  });
  it('older Android (no runtime permission): status stands', () => {
    assert.equal(classifyPermission({ status: 'denied', canAskAgain: true, runtimeGranted: null }), 'undetermined');
    assert.equal(classifyPermission({ status: 'denied', canAskAgain: false, runtimeGranted: null }), 'denied');
    assert.equal(classifyPermission({ status: 'undetermined', canAskAgain: true, runtimeGranted: null }), 'undetermined');
    assert.equal(classifyPermission({ status: 'granted', canAskAgain: true, runtimeGranted: null }), 'granted');
  });
});

describe('pinned Steps card from the Steps habit', () => {
  it('reads the habit\u2019s own log when Health Connect has nothing', () => {
    const values: Record<string, number> = { [TODAY]: 4200, [YESTERDAY]: 8000 };
    const view = stepsCardViewFromHabit((d) => values[d] ?? 0, TODAY);
    assert.equal(view.present, true);
    assert.equal(view.today, 4200);
    assert.equal(view.series7.length, 7);
    assert.equal(view.series7[6], 4200);
    assert.equal(view.series7[5], 8000);
    assert.equal(view.avg7, 6100, 'averaged over the days with a figure, as the Health Connect card does');
  });
});

describe('render-thread memo boundaries', () => {
  const base = withPreset(withPreset(buildEmptyState(TODAY), 'squat-snack', 'h_squat'), 'steps', 'h_steps');
  const state: TrackerState = { ...base, water: [drink('w1', TODAY, NOON)] };
  const water = state.habits.find((h) => h.presetId === 'water')!;
  const steps = state.habits.find((h) => h.id === 'h_steps')!;

  it('a reminder edit on one habit leaves the other habits\u2019 views (and their streak walks) alone', () => {
    const before = habitView(state, water, TODAY);
    const stepsPolicy = state.policies.find((p) => p.habitId === 'h_steps')!;
    const edited: TrackerState = { ...state, policies: state.policies.map((p) => (p === stepsPolicy ? { ...p, enabled: !p.enabled } : p)) };
    assert.equal(habitView(edited, water, TODAY), before, 'same view object across the policy edit');
    assert.notEqual(habitView(edited, steps, TODAY), habitView(state, steps, TODAY), 'the edited habit\u2019s view is rebuilt');
    const ruled: TrackerState = { ...state, rules: state.rules.map((r) => (r.habitId === 'h_steps' ? { ...r, target: 9000 } : r)) };
    assert.equal(habitView(ruled, water, TODAY), before, 'a rule change on Steps is not Water\u2019s business');
  });

  it('a body-only change (a Health Connect read) reuses the plan built a moment ago', () => {
    const plan = nudgePlan(state, TODAY, NOON, ZONE);
    const synced: TrackerState = { ...state, body: { ...state.body, steps: [{ day: TODAY, steps: 1200 }] } };
    assert.equal(nudgePlan(synced, TODAY, NOON, ZONE), plan, 'same plan object');
    const tapped: TrackerState = { ...state, water: [...state.water, drink('w2', TODAY, NOON + 1)] };
    assert.notEqual(nudgePlan(tapped, TODAY, NOON, ZONE), plan, 'a drink is the planner\u2019s business');
  });
});
