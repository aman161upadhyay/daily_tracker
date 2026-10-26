/// <reference types="node" />
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import type { SqlDriver, SqlValue } from '../src/data/sql/driver';
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../src/data/sql/schema';
import { SqliteStore } from '../src/data/sql/sqliteStore';
import { parseState } from '../src/data/store';
import { EXERCISE_TYPE, exerciseLabel, isStrengthExercise, isWalk } from '../src/domain/body/exerciseTypes';
import { mergeBody, normalizeBody } from '../src/domain/body/merge';
import { bedtimeSpreadMin, bucketWeekly, formatSleep, lastNight, latestWeight, originName, workoutsThisWeek } from '../src/domain/body/stats';
import { EMPTY_BODY, type BodyBatch, type Workout } from '../src/domain/body/types';
import { addDays, instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { syncWindow } from '../src/services/bodySync';
import { autoTickActions, ticksStrength } from '../src/state/bodyCommands';
import { applyAll, type CommandContext } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from '../src/state/seed';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `b${++seq}` };

/** Empty state with the Steps, Strength session and Water habits, nothing logged. */
function withHabits(): TrackerState {
  let state = buildEmptyState(TODAY, undefined, { withWater: true });
  for (const presetId of ['steps', 'strength-session']) {
    const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID[presetId]!, `h-${presetId}`, addDays(TODAY, -40));
    state = reducer(state, { type: 'ADD_HABIT', habit, rule, policy });
  }
  return state;
}

function workout(partial: Partial<Workout> & { id: string }): Workout {
  const startAt = partial.startAt ?? instantOf(TODAY, 7 * 60, ZONE);
  const minutes = partial.minutes ?? 45;
  return { startAt, endAt: startAt + minutes * 60_000, day: TODAY, type: EXERCISE_TYPE.STRENGTH_TRAINING, minutes, hidden: false, ...partial };
}

describe('mergeBody', () => {
  it('is idempotent and returns the same object when nothing changed', () => {
    const batch: BodyBatch = {
      steps: [{ day: TODAY, steps: 4200, origin: 'com.sec.android.app.shealth' }],
      sleep: [{ id: 's1', startAt: 1, endAt: 2, day: TODAY, minutes: 420 }],
      heart: [{ day: TODAY, restingBpm: 58 }],
      weight: [{ id: 'w1', at: 1, day: TODAY, kg: 74.2 }],
      workouts: [workout({ id: 'x1' })],
    };
    const once = mergeBody(EMPTY_BODY, batch);
    assert.equal(once.steps.length, 1);
    const twice = mergeBody(once, JSON.parse(JSON.stringify(batch)) as BodyBatch);
    assert.equal(twice, once, 'same reference when the re-read matches');
  });

  it('replaces a changed step total instead of adding to it (yesterday is always re-read)', () => {
    const a = mergeBody(EMPTY_BODY, { steps: [{ day: TODAY, steps: 4200 }] });
    const b = mergeBody(a, { steps: [{ day: TODAY, steps: 9100 }] });
    assert.deepEqual(
      b.steps.map((s) => s.steps),
      [9100],
    );
  });

  it('combines heart fields from the sample and resting reads', () => {
    const a = mergeBody(EMPTY_BODY, { heart: [{ day: TODAY, minBpm: 52, avgBpm: 70, maxBpm: 140 }] });
    const b = mergeBody(a, { heart: [{ day: TODAY, restingBpm: 55 }] });
    assert.deepEqual(b.heart, [{ day: TODAY, minBpm: 52, avgBpm: 70, maxBpm: 140, restingBpm: 55 }]);
  });

  it('keeps a hidden workout hidden when it comes back in a later read', () => {
    const a = mergeBody(EMPTY_BODY, { workouts: [workout({ id: 'x1' })] });
    const hidden = { ...a, workouts: a.workouts.map((w) => ({ ...w, hidden: true })) };
    const b = mergeBody(hidden, { workouts: [workout({ id: 'x1', title: 'Push day' })] });
    assert.equal(b.workouts[0]!.hidden, true);
    assert.equal(b.workouts[0]!.title, 'Push day');
  });

  it('normalizes a missing or partial body slice', () => {
    assert.deepEqual(normalizeBody(undefined), EMPTY_BODY);
    const n = normalizeBody({ steps: [{ day: TODAY, steps: 10 }], sync: { granted: ['Steps', 'Nope'] } });
    assert.deepEqual(n.steps, [{ day: TODAY, steps: 10 }]);
    assert.deepEqual(n.sync, { granted: ['Steps'], background: false });
    assert.deepEqual(n.workouts, []);
  });
});

describe('auto-ticks from a Health Connect read', () => {
  it('fills the Steps habit and replaces the automatic entry on a later read', () => {
    const state = withHabits();
    const first = applyAll(state, autoTickActions(state, { steps: [{ day: TODAY, steps: 4200 }] }, ctx), reducer);
    const auto = first.entries.filter((e) => e.habitId === 'h-steps');
    assert.equal(auto.length, 1);
    assert.equal(auto[0]!.value, 4200);
    assert.equal(auto[0]!.source, 'AUTO_HC');

    const second = applyAll(first, autoTickActions(first, { steps: [{ day: TODAY, steps: 9100 }] }, ctx), reducer);
    assert.deepEqual(
      second.entries.filter((e) => e.habitId === 'h-steps').map((e) => e.value),
      [9100],
    );
    // Unchanged total → no actions at all.
    assert.deepEqual(autoTickActions(second, { steps: [{ day: TODAY, steps: 9100 }] }, ctx), []);
  });

  it('never overrides a steps total the user typed, and a manual entry evicts the automatic one', () => {
    const state = withHabits();
    const auto = applyAll(state, autoTickActions(state, { steps: [{ day: TODAY, steps: 4200 }] }, ctx), reducer);
    const manual = reducer(auto, { type: 'ADD_ENTRY', entry: { id: 'm1', habitId: 'h-steps', day: TODAY, at: NOW, zone: ZONE, value: 8000, source: 'MANUAL' } });
    assert.deepEqual(
      manual.entries.filter((e) => e.habitId === 'h-steps').map((e) => [e.value, e.source]),
      [[8000, 'MANUAL']],
    );
    assert.deepEqual(autoTickActions(manual, { steps: [{ day: TODAY, steps: 12000 }] }, ctx), []);
  });

  it('ticks Strength session once per day for strength or generic workouts of 15+ minutes', () => {
    const state = withHabits();
    const batch: BodyBatch = {
      workouts: [
        workout({ id: 'short', minutes: 10 }),
        workout({ id: 'walk', type: EXERCISE_TYPE.WALKING, minutes: 60 }),
        workout({ id: 'gym', minutes: 45 }),
        workout({ id: 'gym2', minutes: 30, startAt: instantOf(TODAY, 18 * 60, ZONE) }),
        workout({ id: 'generic', type: EXERCISE_TYPE.OTHER_WORKOUT, minutes: 20, day: addDays(TODAY, -1), startAt: instantOf(addDays(TODAY, -1), 8 * 60, ZONE) }),
        workout({ id: 'hiddenOne', minutes: 40, day: addDays(TODAY, -2), startAt: instantOf(addDays(TODAY, -2), 8 * 60, ZONE), hidden: true }),
      ],
    };
    const next = applyAll(state, autoTickActions(state, batch, ctx), reducer);
    const ticks = next.entries.filter((e) => e.habitId === 'h-strength-session');
    assert.deepEqual(ticks.map((e) => e.day).sort(), [addDays(TODAY, -1), TODAY]);
    assert.ok(ticks.every((e) => e.source === 'AUTO_HC' && e.value === 1));
    // Re-reading the same sessions adds nothing.
    assert.deepEqual(autoTickActions(next, batch, ctx), []);
    assert.equal(ticksStrength(EXERCISE_TYPE.STRENGTH_TRAINING, 14), false);
    assert.equal(ticksStrength(0, 15), true);
  });

  it('imports drinks once by record id and skips a drink the user already logged', () => {
    let state = withHabits();
    const at = instantOf(TODAY, 9 * 60, ZONE);
    state = reducer(state, { type: 'ADD_WATER', entry: { id: 'mine', at, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' } });
    const batch: BodyBatch = {
      hydration: [
        { id: 'hc-1', at: at + 2 * 60_000, ml: 245 }, // same drink, logged in both apps
        { id: 'hc-2', at: at + 3 * 3_600_000, ml: 330 },
        { id: 'hc-3', at: at + 4 * 3_600_000, ml: 0 },
      ],
    };
    const next = applyAll(state, autoTickActions(state, batch, ctx), reducer);
    const imported = next.water.filter((w) => w.source === 'AUTO_HC');
    assert.deepEqual(
      imported.map((w) => [w.ml, w.externalId]),
      [[330, 'hc-2']],
    );
    assert.equal(next.water.length, 2);
    assert.deepEqual(autoTickActions(next, batch, ctx), []);
  });

  it('CLEAR_BODY removes imported numbers and the entries they created, nothing else', () => {
    let state = withHabits();
    state = reducer(state, { type: 'ADD_ENTRY', entry: { id: 'm1', habitId: 'h-strength-session', day: addDays(TODAY, -3), at: NOW, zone: ZONE, value: 1, source: 'MANUAL' } });
    const batch: BodyBatch = { steps: [{ day: TODAY, steps: 4200 }], workouts: [workout({ id: 'gym' })], hydration: [{ id: 'hc-2', at: NOW, ml: 330 }] };
    state = applyAll(state, [{ type: 'IMPORT_BODY', batch }, ...autoTickActions(state, batch, ctx)], reducer);
    assert.equal(state.entries.length, 3);
    const cleared = reducer(state, { type: 'CLEAR_BODY' });
    assert.deepEqual(cleared.body, EMPTY_BODY);
    assert.deepEqual(
      cleared.entries.map((e) => e.id),
      ['m1'],
    );
    assert.deepEqual(cleared.water, []);
  });
});

describe('sync window', () => {
  it('reads 30 days the first time, then from the day before the last sync, capped at 14', () => {
    const state = withHabits();
    assert.deepEqual(syncWindow(state, ctx), { fromDay: addDays(TODAY, -29), toDay: TODAY });

    const recent = reducer(state, { type: 'BODY_SYNC', patch: { lastSyncAt: instantOf(addDays(TODAY, -2), 20 * 60, ZONE) } });
    assert.deepEqual(syncWindow(recent, ctx), { fromDay: addDays(TODAY, -3), toDay: TODAY });

    const today = reducer(state, { type: 'BODY_SYNC', patch: { lastSyncAt: NOW - 60_000 } });
    assert.deepEqual(syncWindow(today, ctx), { fromDay: addDays(TODAY, -1), toDay: TODAY });

    const stale = reducer(state, { type: 'BODY_SYNC', patch: { lastSyncAt: instantOf(addDays(TODAY, -60), 20 * 60, ZONE) } });
    assert.deepEqual(syncWindow(stale, ctx), { fromDay: addDays(TODAY, -13), toDay: TODAY });
  });

  it('BODY_SYNC drops cleared fields instead of storing undefined', () => {
    const state = reducer(withHabits(), { type: 'BODY_SYNC', patch: { lastError: 'boom', granted: ['Steps'] } });
    const ok = reducer(state, { type: 'BODY_SYNC', patch: { lastError: undefined, lastSyncAt: NOW } });
    assert.deepEqual(ok.body.sync, { granted: ['Steps'], background: false, lastSyncAt: NOW });
    assert.equal('lastError' in ok.body.sync, false);
  });
});

describe('body read models', () => {
  it('last night falls back to yesterday and bedtime spread needs three nights', () => {
    let body = EMPTY_BODY;
    assert.equal(lastNight(body, TODAY), undefined);
    const nights = [1, 2, 3].map((d) => ({
      id: `n${d}`,
      day: addDays(TODAY, -d),
      startAt: instantOf(addDays(TODAY, -d - 1), 23 * 60 + d * 10, ZONE),
      endAt: instantOf(addDays(TODAY, -d), 7 * 60, ZONE),
      minutes: 430,
    }));
    body = mergeBody(body, { sleep: nights.slice(0, 1) });
    assert.equal(lastNight(body, TODAY)?.isToday, false);
    assert.equal(bedtimeSpreadMin(body, TODAY, ZONE), undefined);
    body = mergeBody(body, { sleep: nights });
    // Bedtimes 23:10, 23:20, 23:30 → population standard deviation ≈ 8 min.
    assert.equal(bedtimeSpreadMin(body, TODAY, ZONE), 8);
  });

  it('latest weight reports the 30-day delta only when an older reading exists', () => {
    const w1 = { id: 'w1', at: instantOf(addDays(TODAY, -35), 8 * 60, ZONE), day: addDays(TODAY, -35), kg: 76 };
    const w2 = { id: 'w2', at: instantOf(TODAY, 8 * 60, ZONE), day: TODAY, kg: 75.2 };
    assert.deepEqual(latestWeight(mergeBody(EMPTY_BODY, { weight: [w2] })), { kg: 75.2, day: TODAY });
    const both = latestWeight(mergeBody(EMPTY_BODY, { weight: [w1, w2] }))!;
    assert.equal(both.delta30?.toFixed(1), '-0.8');
  });

  it('counts the week’s workouts without walks or hidden sessions', () => {
    const body = mergeBody(EMPTY_BODY, {
      workouts: [workout({ id: 'gym' }), workout({ id: 'walk', type: EXERCISE_TYPE.WALKING }), workout({ id: 'hid', hidden: true }), workout({ id: 'old', day: addDays(TODAY, -10) })],
    });
    assert.deepEqual(
      workoutsThisWeek(body, TODAY).map((w) => w.id),
      ['gym'],
    );
  });

  it('formats and labels', () => {
    assert.equal(formatSleep(430), '7h 10m');
    assert.equal(formatSleep(45), '45m');
    assert.deepEqual(bucketWeekly([0, 100, 200, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50], 'avg'), [150, 50]);
    assert.equal(originName('com.sec.android.app.shealth'), 'Samsung Health');
    assert.equal(originName('com.example.ring'), 'ring');
    assert.equal(exerciseLabel(EXERCISE_TYPE.STRENGTH_TRAINING), 'Strength training');
    assert.equal(exerciseLabel(0, 'Push day'), 'Push day');
    assert.equal(isStrengthExercise(EXERCISE_TYPE.WEIGHTLIFTING), true);
    assert.equal(isWalk(EXERCISE_TYPE.WALKING), true);
  });
});

/** node:sqlite behind the same surface expo-sqlite exposes. */
class NodeDriver implements SqlDriver {
  readonly db = new DatabaseSync(':memory:');
  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }
  async runAsync(sql: string, params: SqlValue[]): Promise<unknown> {
    return this.db.prepare(sql).run(...params);
  }
  async getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

describe('body persistence', () => {
  it('round-trips imported data, hidden flags and water externalId through SQLite', async () => {
    const driver = new NodeDriver();
    const store = await SqliteStore.open(driver);
    const base = withHabits();
    await store.replace(base);
    let state = base;
    const batch: BodyBatch = {
      steps: [{ day: TODAY, steps: 4200, origin: 'com.sec.android.app.shealth' }],
      sleep: [{ id: 's1', startAt: 1, endAt: 2, day: TODAY, minutes: 420, deepMin: 80, remMin: 90 }],
      heart: [{ day: TODAY, restingBpm: 58, minBpm: 52, avgBpm: 70, maxBpm: 140 }],
      weight: [{ id: 'w1', at: 1, day: TODAY, kg: 74.2, origin: 'com.withings.wiscale2' }],
      workouts: [workout({ id: 'x1', title: 'Push day' }), workout({ id: 'x2', hidden: true })],
      hydration: [{ id: 'hc-1', at: NOW, ml: 330 }],
    };
    state = applyAll(state, [{ type: 'IMPORT_BODY', batch }, ...autoTickActions(state, batch, ctx)], reducer);
    state = reducer(state, { type: 'BODY_SYNC', patch: { granted: ['Steps', 'Hydration'], background: true, lastSyncAt: NOW } });
    await store.persist(base, state);
    const loaded = await SqliteStore.open(driver).then((s) => s.load());
    assert.ok(loaded);
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.body)), JSON.parse(JSON.stringify(state.body)));
    assert.deepEqual(
      loaded.water.map((w) => [w.source, w.externalId]),
      [['AUTO_HC', 'hc-1']],
    );
    assert.equal(loaded.settings.healthConnectEnabled, false);

    // Clearing persists incrementally too (rows deleted, not just forgotten).
    await store.persist(state, reducer(state, { type: 'CLEAR_BODY' }));
    const after = await SqliteStore.open(driver).then((s) => s.load());
    assert.deepEqual(after!.body, EMPTY_BODY);
    assert.deepEqual(after!.water, []);
  });

  it('upgrades a v2 database: new tables, external_id column, old rows kept', async () => {
    const driver = new NodeDriver();
    driver.db.exec(MIGRATIONS[0]!);
    driver.db.exec(MIGRATIONS[1]!);
    driver.db.exec('PRAGMA user_version = 2');
    driver.db.exec("INSERT INTO kv (key, value) VALUES ('settings', '{\"name\":\"Aman\"}')");
    driver.db.exec("INSERT INTO water_entry (id, at, zone, day, ml, source) VALUES ('w-old', 1, 'America/New_York', '2026-10-20', 250, 'MANUAL')");
    assert.deepEqual(await migrate(driver), { from: 2, to: SCHEMA_VERSION });
    const cols = driver.db.prepare('PRAGMA table_info(water_entry)').all() as { name: string }[];
    assert.ok(cols.some((c) => c.name === 'external_id'));
    const loaded = await SqliteStore.open(driver).then((s) => s.load());
    assert.equal(loaded?.water[0]?.id, 'w-old');
    assert.equal(loaded?.water[0]?.externalId, undefined);
    assert.deepEqual(loaded?.body, EMPTY_BODY);
  });

  it('parseState accepts exports that predate the body slice', () => {
    const saved = JSON.parse(JSON.stringify(buildEmptyState(TODAY))) as Record<string, unknown>;
    delete saved.body;
    delete (saved.settings as Record<string, unknown>).healthConnectEnabled;
    const parsed = parseState(saved);
    assert.deepEqual(parsed.body, EMPTY_BODY);
    assert.equal(parsed.settings.healthConnectEnabled, false);
  });

  it('sample data carries labelled body numbers and automatic steps entries', () => {
    const sample = buildSampleState(TODAY, ZONE, NOW);
    assert.ok(sample.body.steps.length >= 14);
    assert.ok(sample.body.sleep.length >= 7);
    assert.ok(sample.body.workouts.length >= 2);
    const steps = sample.habits.find((h) => h.presetId === 'steps')!;
    const auto = sample.entries.filter((e) => e.habitId === steps.id);
    assert.ok(auto.length > 0);
    assert.ok(auto.every((e) => e.source === 'AUTO_HC'));
  });
});
