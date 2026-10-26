/// <reference types="node" />
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { JsonStore, MemoryBackend } from '../src/data/jsonStore';
import type { SqlDriver, SqlValue } from '../src/data/sql/driver';
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../src/data/sql/schema';
import { SqliteStore } from '../src/data/sql/sqliteStore';
import { diffById, parseState, type TrackerStore } from '../src/data/store';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState } from '../src/state/seed';
import type { TrackerState } from '../src/state/types';

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

const TODAY = '2026-10-25';
const ZONE = 'America/New_York';
const NOW = Date.UTC(2026, 9, 25, 18, 30); // 2:30 pm New York

/** Order-independent view of a state for comparisons (undefined fields dropped, like JSON). */
function canon(raw: TrackerState): TrackerState {
  const s = JSON.parse(JSON.stringify(raw)) as TrackerState;
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...s,
    habits: byId(s.habits),
    rules: [...s.rules].sort((a, b) => `${a.habitId}|${a.effectiveFrom}`.localeCompare(`${b.habitId}|${b.effectiveFrom}`)),
    policies: [...s.policies].sort((a, b) => a.habitId.localeCompare(b.habitId)),
    entries: byId(s.entries),
    water: byId(s.water),
    snacks: byId(s.snacks),
    mind: byId(s.mind),
    nudgeEvents: byId(s.nudgeEvents),
    events: byId(s.events),
  };
}

function storeContract(name: string, open: () => Promise<TrackerStore>) {
  describe(`${name} store`, () => {
    it('is empty on a fresh install', async () => {
      const store = await open();
      assert.equal(await store.load(), null);
    });

    it('round-trips a full sample state', async () => {
      const store = await open();
      const sample = buildSampleState(TODAY, ZONE, NOW);
      await store.replace(sample);
      const loaded = await store.load();
      assert.ok(loaded);
      assert.deepEqual(canon(loaded), canon(sample));
      assert.ok(sample.water.length > 100, 'sample has real history');
    });

    it('persists reducer actions incrementally', async () => {
      const store = await open();
      let state = buildEmptyState(TODAY);
      await store.replace(state);
      const water = state.habits[0]!;

      const step = async (action: Parameters<typeof reducer>[1]) => {
        const next = reducer(state, action);
        await store.persist(state, next);
        state = next;
        const loaded = await store.load();
        assert.ok(loaded);
        assert.deepEqual(canon(loaded), canon(state));
      };

      await step({ type: 'ADD_WATER', entry: { id: 'w1', at: NOW, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' } });
      await step({ type: 'ADD_WATER', entry: { id: 'w2', at: NOW + 1, zone: ZONE, day: TODAY, ml: 350, source: 'AUTO_WIDGET' } });
      await step({ type: 'UNDO_WATER', day: TODAY });
      await step({ type: 'UPDATE_HABIT', id: water.id, patch: { pinned: true, name: 'Hydrate' } });
      await step({ type: 'SET_RULE', rule: { habitId: water.id, effectiveFrom: TODAY, cadence: 'DAILY', timesPerPeriod: 1, target: 2500, freezesPerMonth: 3 } });
      await step({ type: 'SET_POLICY', policy: { habitId: water.id, kind: 'INTERVAL', intervalMin: 90, onlyWhenBehind: true, maxPerDay: 6, enabled: false } });
      await step({ type: 'UPDATE_SETTINGS', patch: { units: 'oz', name: 'Sam' } });
      await step({ type: 'SNOOZE', untilMs: NOW + 600_000 });
      await step({ type: 'SWAP', day: TODAY });
      await step({ type: 'PERIOD_START', day: TODAY, today: TODAY });
      await step({
        type: 'ADD_HABIT',
        habit: { id: 'h_custom', name: 'Floss', category: 'body', type: 'YES_NO', unit: '', icon: 'shield', createdDay: TODAY, archived: false, pinned: false },
        rule: { habitId: 'h_custom', effectiveFrom: TODAY, cadence: 'WEEKLY', timesPerPeriod: 5, target: 1, freezesPerMonth: 2 },
        policy: { habitId: 'h_custom', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false },
      });
      await step({ type: 'TOGGLE_ENTRY', entry: { id: 'e1', habitId: 'h_custom', day: TODAY, at: NOW, zone: ZONE, value: 1, source: 'MANUAL' } });
      await step({ type: 'LOG_SNACK', snack: { id: 's1', at: NOW, zone: ZONE, day: TODAY, type: 'SQUATS', reps: 15, trigger: 'MANUAL' } });
      await step({ type: 'LOG_MIND', session: { id: 'm1', startAt: NOW - 600_000, endAt: NOW, zone: ZONE, day: TODAY, kind: 'MEDITATION', minutes: 10 } });
      await step({ type: 'TOGGLE_ENTRY', entry: { id: 'e2', habitId: 'h_custom', day: TODAY, at: NOW, zone: ZONE, value: 1, source: 'MANUAL' } });
      // Replacing everything through persist (sample data, import) works too.
      await step({ type: 'REPLACE', state: buildSampleState(TODAY, ZONE, NOW) });
      await step({ type: 'REPLACE', state: buildEmptyState(TODAY, state.settings) });
    });

    it('keeps service records beside the state, compare-and-set, and replaces them with it', async () => {
      const store = await open();
      await store.replace(buildEmptyState(TODAY));
      assert.equal(await store.readRecord('nudges.bookkeeping'), null);
      assert.equal(await store.writeRecord('nudges.bookkeeping', 'one', 'stale'), false, 'a write that expects a record that is not there is refused');
      assert.equal(await store.writeRecord('nudges.bookkeeping', 'one', null), true);
      assert.equal(await store.readRecord('nudges.bookkeeping'), 'one');
      assert.equal(await store.writeRecord('nudges.bookkeeping', 'two', 'zero'), false, 'a write against a moved record is refused');
      assert.equal(await store.readRecord('nudges.bookkeeping'), 'one', 'and leaves it alone');
      assert.equal(await store.writeRecord('nudges.bookkeeping', 'two', 'one'), true);
      assert.equal(await store.writeRecord('nudges.responses', '{}', null), true);
      assert.equal(await store.readRecord('nudges.bookkeeping'), 'two');
      assert.equal(await store.readRecord('nudges.responses'), '{}', 'records are independent');
      // A row-level persist leaves the records alone; a whole replace takes them with the old state.
      const before = (await store.load())!;
      const after = reducer(before, { type: 'ADD_WATER', entry: { id: 'w1', day: TODAY, at: NOW, zone: ZONE, ml: 250, source: 'MANUAL' } });
      await store.persist(before, after);
      assert.equal(await store.readRecord('nudges.bookkeeping'), 'two');
      await store.replace(buildSampleState(TODAY, ZONE, NOW));
      assert.equal(await store.readRecord('nudges.bookkeeping'), null, 'gone with the replaced state');
      assert.equal(await store.readRecord('nudges.responses'), null);
      assert.equal(await store.writeRecord('nudges.bookkeeping', 'three', null), true, 'and a fresh one starts from nothing');
      assert.equal(await store.writeRecord('nudges.bookkeeping', null, 'three'), true, 'null removes');
      assert.equal(await store.readRecord('nudges.bookkeeping'), null);
    });
  });
}

storeContract('sqlite', async () => SqliteStore.open(new NodeDriver()));
storeContract('json', async () => new JsonStore(new MemoryBackend()));

describe('schema migrations', () => {
  it('stamps user_version and is idempotent', async () => {
    const driver = new NodeDriver();
    assert.deepEqual(await migrate(driver), { from: 0, to: SCHEMA_VERSION });
    assert.deepEqual(await migrate(driver), { from: SCHEMA_VERSION, to: SCHEMA_VERSION });
    const tables = driver.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
    assert.deepEqual(
      tables.map((t) => t.name),
      ['cycle_day', 'habit', 'habit_entry', 'habit_rule', 'heart_day', 'kv', 'mind_session', 'movement_snack', 'nudge_event', 'nudge_policy', 'scheduled_event', 'sleep_night', 'step_day', 'water_entry', 'weight_entry', 'workout'],
    );
  });

  it('upgrades a v1 database in place and keeps its rows', async () => {
    const driver = new NodeDriver();
    // Replay only the first migration, as an M1 install would have.
    driver.db.exec(MIGRATIONS[0]!);
    driver.db.exec('PRAGMA user_version = 1');
    driver.db.exec("INSERT INTO kv (key, value) VALUES ('settings', '{\"name\":\"Aman\"}')");
    assert.deepEqual(await migrate(driver), { from: 1, to: SCHEMA_VERSION });
    const store = await SqliteStore.open(driver);
    const loaded = await store.load();
    assert.equal(loaded?.settings.name, 'Aman');
    assert.deepEqual(loaded?.nudgeEvents, []);
    assert.deepEqual(loaded?.events, []);
    assert.deepEqual(loaded?.settings.widgetHabitIds, []);
  });

  it('refuses a database from a newer app', async () => {
    const driver = new NodeDriver();
    driver.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    await assert.rejects(() => migrate(driver), /newer version/);
  });
});

describe('state parsing', () => {
  it('fills in settings added after the data was saved', () => {
    const saved = JSON.parse(JSON.stringify(buildEmptyState(TODAY))) as Record<string, unknown>;
    delete (saved.settings as Record<string, unknown>).onboardingDone;
    delete (saved.settings as Record<string, unknown>).tapSizeMl;
    const parsed = parseState(saved);
    assert.equal(parsed.settings.onboardingDone, false);
    assert.equal(parsed.settings.tapSizeMl, 250);
  });

  it('accepts M1 exports that predate the nudge-event lists', () => {
    const saved = JSON.parse(JSON.stringify(buildEmptyState(TODAY))) as Record<string, unknown>;
    delete saved.nudgeEvents;
    delete saved.events;
    delete (saved.settings as Record<string, unknown>).weeklySummary;
    const parsed = parseState(saved);
    assert.deepEqual(parsed.nudgeEvents, []);
    assert.deepEqual(parsed.events, []);
    assert.deepEqual(parsed.settings.weeklySummary, { enabled: true, weekday: 6, minute: 18 * 60 });
  });

  it('rejects foreign or newer data', () => {
    assert.throws(() => parseState({ hello: 1 }), /version/);
    assert.throws(() => parseState({ version: 1, habits: [] }), /Missing/);
    assert.throws(() => parseState('nope'), /Not a Daily Tracker/);
  });
});

describe('diffById', () => {
  it('reports changed, added and removed items by key', () => {
    const a = { id: 'a', v: 1 };
    const b = { id: 'b', v: 1 };
    const b2 = { id: 'b', v: 2 };
    const c = { id: 'c', v: 1 };
    const d = diffById([a, b], [a, b2, c], (x) => x.id);
    assert.deepEqual(d.upsert, [b2, c]);
    assert.deepEqual(d.remove, []);
    const d2 = diffById([a, b], [b], (x) => x.id);
    assert.deepEqual(d2, { upsert: [], remove: ['a'] });
  });
});
