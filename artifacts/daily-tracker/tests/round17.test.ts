/**
 * Round 17: a reminder chosen while creating a habit is stored as the habit page would have saved
 * it; the cycle insights re-read the week start (ADV16-02); the widget's headless tap draws as saved
 * once it is on disk, whatever fails after it (ADV16-01); and the test-audit lens's mutation gaps
 * (TEST17-01…06): a failed save or replace rolls back whole, the default backup cipher strength, the
 * snapshot stamp's size half, Sunday-first partial quotas, a start-only night edit, weekday names.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { encryptBackup } from '../src/data/backupCrypto';
import type { SqlDriver, SqlValue } from '../src/data/sql/driver';
import { SqliteStore } from '../src/data/sql/sqliteStore';
import { mergeBody } from '../src/domain/body/merge';
import { EMPTY_BODY, type SleepNight } from '../src/domain/body/types';
import { periodRequired } from '../src/domain/habits/streaks';
import type { NudgePolicy } from '../src/domain/models';
import { weekdayName } from '../src/domain/time/format';
import { addDays, instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { newHabitAction, type HabitDraft } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, habitFromPreset } from '../src/state/seed';
import { completedCycles, cycleInsights, habitsPerCycle } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const NY = 'America/New_York';

const draft: HabitDraft = { name: '  Floss ', category: 'body', type: 'YES_NO', unit: 'x', icon: 'check', cadence: 'WEEKLY', timesPerPeriod: 3, target: 4, freezesPerMonth: 1, pinned: false };

describe('a reminder set while creating a habit', () => {
  it('is stored under the new habit, switched on, exactly as drafted', () => {
    const reminder: NudgePolicy = { habitId: 'new', kind: 'FIXED', times: ['19:00'], weekdays: [0, 2, 4], onlyWhenBehind: true, maxPerDay: 1, enabled: true };
    const action = newHabitAction({ ...draft, reminder }, 'h1', '2026-10-28');
    assert.equal(action.habit.id, 'h1');
    assert.equal(action.habit.name, 'Floss');
    assert.equal(action.habit.unit, '', 'a yes/no habit has no unit');
    assert.deepEqual(action.rule, { habitId: 'h1', effectiveFrom: '2026-10-28', cadence: 'WEEKLY', timesPerPeriod: 3, target: 1, freezesPerMonth: 1 });
    assert.deepEqual(action.policy, { ...reminder, habitId: 'h1', enabled: true });
    const state = reducer(buildEmptyState('2026-10-28'), action);
    assert.equal(state.policies.find((p) => p.habitId === 'h1')?.kind, 'FIXED');
  });

  it('an interval reminder keeps its interval; Off and the rotation store no reminder', () => {
    const every = newHabitAction({ ...draft, reminder: { habitId: 'x', kind: 'INTERVAL', intervalMin: 90, onlyWhenBehind: false, maxPerDay: 3, enabled: true } }, 'h2', '2026-10-28');
    assert.equal(every.policy.kind, 'INTERVAL');
    assert.equal(every.policy.intervalMin, 90);
    assert.equal(every.policy.habitId, 'h2');
    const none = newHabitAction({ ...draft, reminder: { habitId: 'x', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false } }, 'h3', '2026-10-28');
    assert.deepEqual(none.policy, { habitId: 'h3', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false });
    const rotation = newHabitAction({ ...draft, reminder: { habitId: 'x', kind: 'ROTATION', intervalMin: 60, onlyWhenBehind: false, maxPerDay: 6, enabled: true } }, 'h4', '2026-10-28');
    assert.equal(rotation.policy.kind, 'NONE', 'a custom habit has no snack type, so it cannot join the rotation');
    const absent = newHabitAction(draft, 'h5', '2026-10-28');
    assert.equal(absent.policy.kind, 'NONE');
    assert.equal(absent.policy.enabled, false);
  });
});

/** Four completed cycles with a weekly habit whose completions drift from Monday to Sunday — the adherence per cycle depends on the week start. */
function cycleState(): TrackerState {
  const base = buildEmptyState('2026-10-28');
  const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID['technical-reading']!, 'h', '2026-06-01');
  const starts = ['2026-06-01', '2026-06-29', '2026-07-27', '2026-08-24', '2026-09-21'];
  const entries: TrackerState['entries'] = [];
  const cycleLogs: TrackerState['cycleLogs'] = [];
  for (let c = 0; c < 4; c++) {
    for (let d = 0; d < 3; d++) cycleLogs.push({ day: addDays(starts[c]!, d), symptoms: { cramps: ((c % 3) + 1) as 1 | 2 | 3 } });
    for (let w = 0; w < 4; w++) {
      const day = addDays(starts[c]!, w * 7 + (w < c ? 6 : 0));
      entries.push({ id: `${c}-${w}`, habitId: 'h', day, at: instantOf(day, 720, NY), zone: NY, value: rule.target, source: 'MANUAL' });
    }
  }
  return {
    ...base,
    habits: [habit],
    rules: [{ ...rule, timesPerPeriod: 1 }],
    policies: [policy],
    entries,
    cycleLogs,
    settings: { ...base.settings, cycle: { ...base.settings.cycle, history: starts.map((start) => ({ start })) } },
  };
}

describe('cycle insights and the week start (ADV16-02)', () => {
  it('a week-start change alone recomputes the correlations', () => {
    const mon = cycleState();
    const sun: TrackerState = { ...mon, settings: { ...mon.settings, weekStart: 'sunday' } };
    const monValues = habitsPerCycle(mon, completedCycles(mon)).map((h) => h.perCycle);
    const sunValues = habitsPerCycle(sun, completedCycles(sun)).map((h) => h.perCycle);
    assert.notDeepEqual(monValues, sunValues, 'the fixture must differ by week start');
    const warm = cycleInsights(mon);
    const afterSwitch = cycleInsights(sun);
    const coldState: TrackerState = { ...sun, entries: [...sun.entries] };
    const cold = cycleInsights(coldState);
    assert.deepEqual(afterSwitch, cold, 'the memo must not serve Monday-week correlations for a Sunday-week state');
    assert.notDeepEqual(afterSwitch.correlations, warm.correlations);
    // And the memo still holds across an unrelated change.
    assert.equal(cycleInsights({ ...coldState, water: [...coldState.water] }), cold);
  });
});

/**
 * The widget task handler imports React Native modules, so it is loaded here through the TypeScript
 * transpiler into a sandbox whose requires are stand-ins: the orchestration (lock → load → apply →
 * persist → revision → re-plan → persist) is the real code, the OS and the store are scripted.
 */
function runWidgetTap(fail: 'none' | 'write1' | 'write2' | 'revision' | 'replan'): Promise<{ disk: { count: number }; rendered: { count: number; notice?: string }; writes: number }> {
  const root = path.resolve(__dirname, '..');
  const requireHere = createRequire(path.join(root, 'package.json'));
  const ts = requireHere('typescript');
  const source = fs.readFileSync(path.join(root, 'src/widget/handler.tsx'), 'utf8');
  let disk = { count: 0 };
  let writes = 0;
  let rendered: { count: number; notice?: string } = { count: -1 };
  const mods: Record<string, unknown> = {
    react: { createElement: (_: unknown, props: unknown) => props },
    'react-native-android-widget': { requestWidgetUpdate: async () => {} },
    '@/src/data/createStore': {
      createStore: async () => ({
        load: async () => disk,
        persist: async (_: unknown, next: { count: number }) => {
          writes++;
          if (fail === `write${writes}`) throw new Error(fail);
          disk = next;
        },
      }),
    },
    '@/src/services/headlessLock': { withHeadlessLock: (fn: () => unknown) => fn() },
    '@/src/services/replan': {
      contextFor: () => ({ today: '2026-10-26', nowMs: 1, zone: NY }),
      markHeadlessWrite: async () => {
        if (fail === 'revision') throw new Error(fail);
      },
      replanHeadless: async (s: { count: number }) => {
        if (fail === 'replan') throw new Error(fail);
        return { next: { ...s, folded: true }, delivered: [] };
      },
      acknowledgeDeliveries: async () => {},
    },
    '@/src/services/snapshotSync': { maybeSnapshot: async () => {} },
    '@/src/state/commands': { widgetTapActions: () => [{}], applyAll: (s: { count: number }) => ({ count: s.count + 1 }) },
    '@/src/state/liveStore': { liveStore: () => null },
    '@/src/state/reducer': {},
    './model': { WIDGET_NAME: 'widget', widgetModel: (s: { count: number }) => ({ count: s.count }) },
    './TrackerWidget': { CLICK_LOG: 'LOG', TrackerWidget: 'Widget' },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports: { widgetTaskHandler?: (props: unknown) => Promise<void> } = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id: string) => {
      if (!(id in mods)) throw new Error(`unexpected import ${id}`);
      return mods[id];
    },
    console: { warn() {}, error() {} },
  });
  return exports
    .widgetTaskHandler!({ widgetAction: 'WIDGET_CLICK', clickAction: 'LOG', clickActionData: {}, widgetInfo: { width: 200, height: 200 }, renderWidget: (v: { model: typeof rendered }) => (rendered = v.model) })
    .then(() => ({ disk, rendered, writes }));
}

describe('the widget tap under failures (ADV16-01)', () => {
  it('nothing fails: the tap and the fold are both on disk', async () => {
    const r = await runWidgetTap('none');
    assert.equal(r.writes, 2);
    assert.equal(r.disk.count, 1);
    assert.equal(r.rendered.count, 1);
    assert.equal(r.rendered.notice, undefined);
  });
  it('the first persist fails: the old number and the "could not be saved" notice', async () => {
    const r = await runWidgetTap('write1');
    assert.equal(r.disk.count, 0);
    assert.equal(r.rendered.count, 0);
    assert.match(r.rendered.notice ?? '', /could not be saved/);
  });
  it('the revision, the re-plan or the second persist fails: the saved tap is drawn, without the notice', async () => {
    for (const fail of ['revision', 'replan', 'write2'] as const) {
      const r = await runWidgetTap(fail);
      assert.equal(r.disk.count, 1, fail);
      assert.equal(r.rendered.count, 1, fail);
      assert.equal(r.rendered.notice, undefined, fail);
    }
  });
});

/** node:sqlite behind the same surface expo-sqlite exposes, with one injectable failure. */
class FaultDriver implements SqlDriver {
  readonly db = new DatabaseSync(':memory:');
  failNextSettings = false;
  async execAsync(sql: string) {
    this.db.exec(sql);
  }
  async runAsync(sql: string, params: SqlValue[]) {
    if (this.failNextSettings && /INSERT INTO kv/i.test(sql) && params.includes('settings')) {
      this.failNextSettings = false;
      throw new Error('injected disk-full');
    }
    return this.db.prepare(sql).run(...params);
  }
  async getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async withTransactionAsync(job: () => Promise<void>) {
    this.db.exec('BEGIN');
    try {
      await job();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

describe('a save that fails half-way (TEST17-01)', () => {
  for (const method of ['replace', 'persist'] as const) {
    it(`a failed ${method} leaves the old state and the service records intact, then a retry lands whole`, async () => {
      const driver = new FaultDriver();
      try {
        const store = await SqliteStore.open(driver);
        const before = buildEmptyState('2026-11-01');
        await store.replace(before);
        const record = await store.readRecord('notifications');
        await store.writeRecord('notifications', 'old journal', record.version);
        const journal = await store.readRecord('notifications');
        const next: TrackerState = { ...before, settings: { ...before.settings, name: 'New' }, water: [{ id: 'w', at: Date.parse('2026-11-01T12:00:00Z'), day: '2026-11-01', zone: NY, ml: 250, source: 'MANUAL' }] };
        driver.failNextSettings = true;
        const save = () => (method === 'replace' ? store.replace(next) : store.persist(before, next));
        await assert.rejects(save, /injected disk-full/);
        const unchanged = await store.load();
        assert.equal(unchanged!.settings.name, before.settings.name);
        assert.deepEqual(unchanged!.water, []);
        assert.deepEqual(await store.readRecord('notifications'), journal);
        await save();
        assert.equal((await store.load())!.settings.name, 'New');
        assert.equal((await store.load())!.water.length, 1);
      } finally {
        driver.db.close();
      }
    });
  }
});

describe('mutation gaps from the test audit (TEST17-02…06)', () => {
  it('an export made without an iterations override uses the production PBKDF2 rounds', () => {
    const file = encryptBackup('private health backup', 'correct horse', { now: new Date('2026-11-01T06:30:00Z') });
    assert.equal(file.iterations, 200_000);
  });

  it('the snapshot stamp changes when a same-second rewrite has another size', async () => {
    // backup.native.ts reads expo-file-system; the hooks hand it a stand-in whose size is scripted.
    const { registerHooks } = await import('node:module');
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === 'expo-file-system') return { url: 'r17:fs', shortCircuit: true };
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (url === 'r17:fs') {
          return {
            format: 'commonjs',
            shortCircuit: true,
            source: `
              exports.Paths = { document: '/phone' };
              exports.Directory = class { constructor(...args) { this.name = args.at(-1); } };
              exports.File = class {
                constructor(...args) { this.name = args.at(-1); }
                get exists() { return this.name === 'snapshot.json'; }
                get modificationTime() { return 1000; }
                get size() { return Number(process.env.R17_SIZE); }
              };
            `,
          };
        }
        return nextLoad(url, context);
      },
    });
    const before = process.env.R17_SIZE;
    try {
      const requireHere = createRequire(path.join(path.resolve(__dirname, '..'), 'package.json'));
      const { snapshotStamp } = requireHere('./src/services/backup.native.ts') as { snapshotStamp: () => Promise<string | null> };
      process.env.R17_SIZE = '100';
      const first = await snapshotStamp();
      process.env.R17_SIZE = '120';
      const rewritten = await snapshotStamp();
      assert.equal(first, '1000:100');
      assert.equal(rewritten, '1000:120');
    } finally {
      hooks.deregister();
      if (before === undefined) delete process.env.R17_SIZE;
      else process.env.R17_SIZE = before;
    }
  });

  it('a new weekly cadence owes only the days left in its first Sunday-first week', () => {
    const rule = { cadence: 'WEEKLY' as const, timesPerPeriod: 7 };
    // A cadence beginning Wednesday 28 Oct: four days remain in a Sun–Sat week, five in a Mon–Sun week.
    assert.equal(periodRequired(rule, '2026-10-30', '2026-10-28', undefined, 6), 4);
    assert.equal(periodRequired(rule, '2026-10-30', '2026-10-28', undefined, 0), 5);
    assert.equal(periodRequired(rule, '2026-11-02', '2026-10-28', undefined, 6), 7);
    assert.equal(periodRequired(rule, '2026-10-30', '2026-10-28', new Set(['2026-10-29']), 6), 3);
  });

  it('a start-only upstream edit of a night is a new placing, even with the wake-up unchanged', () => {
    const first: SleepNight = { id: 'night', startAt: Date.parse('2026-11-02T04:00:00Z'), endAt: Date.parse('2026-11-02T12:00:00Z'), day: '2026-11-02', minutes: 480, startOffsetMin: -300, endOffsetMin: -300 };
    const body = mergeBody(EMPTY_BODY, { sleep: [first] });
    const edited: SleepNight = { ...first, startAt: first.startAt + 30 * 60_000, minutes: 450, day: '2026-11-03', startOffsetMin: 780, endOffsetMin: 780 };
    const after = mergeBody(body, { sleep: [edited] });
    assert.equal(after.sleep.length, 1);
    assert.equal(after.sleep[0]!.startAt, edited.startAt);
    assert.equal(after.sleep[0]!.day, '2026-11-03');
    assert.equal(after.sleep[0]!.startOffsetMin, 780);
    assert.equal(after.sleep[0]!.endOffsetMin, 780);
  });

  it('weekday names follow the Monday-zero encoding, whatever the grid order', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(weekdayName), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    assert.equal(weekdayName(7), 'Monday');
    assert.equal(weekdayName(-1), 'Sunday');
  });
});
