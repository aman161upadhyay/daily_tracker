/**
 * Council round 18.
 * - ADV17-01: the "Daily maximum" stepper of a set-times reminder is bounded by the distinct times.
 * - LIFE18-3: the mind bell's schedule and cancel are serialised and the newest request wins.
 * - LIFE18-5: a sync whose owner went away is refused before the OS is touched (no bookkeeping write).
 * - LIFE18-7: a headless re-plan through a live store whose provider was retired stops short of the OS.
 *
 * The notification service imports Expo and React Native modules, so it is loaded through
 * `node:module` hooks that hand it stand-ins: the OS is scripted (schedules held in a map, with a
 * hook to suspend a call), the key-value storage behind the records is in memory. The service's
 * own logic — queues, generations, bookkeeping, the validity checks — is the real code.
 */
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import type { NudgePolicy } from '../src/domain/models';
import { distinctTimeCount, policyFromDraft } from '../src/domain/nudges/describePolicy';
import type { ScheduledNudge } from '../src/domain/nudges/planner';
import { MIND_END_ID, newHabitAction, applyAll, type HabitDraft } from '../src/state/commands';
import type { LiveStore } from '../src/state/liveStore';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { nudgePlan } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

describe('the set-times daily maximum (ADV17-01)', () => {
  it('counts distinct valid clock times: two rows at the same time are one ring', () => {
    assert.equal(distinctTimeCount(['08:00', '08:00']), 1);
    assert.equal(distinctTimeCount(['08:00', '19:30', 'nonsense']), 2);
    assert.equal(distinctTimeCount([]), 0);
  });
  it('and the saved policy never promises more rings than that', () => {
    const draft = { mode: 'FIXED' as const, times: ['08:00', '08:00', '20:00'], intervalMin: 90, onlyWhenBehind: false, maxPerDay: 5 };
    const policy = policyFromDraft({ habitId: 'h' }, draft, { movement: false, water: false });
    assert.deepEqual(policy.times, ['08:00', '20:00']);
    assert.equal(policy.maxPerDay, 2);
    assert.equal(policy.maxPerDay, Math.min(draft.maxPerDay, distinctTimeCount(draft.times)));
  });
});

/* ------------------------------------------------------------------------------------------------ */

interface ScriptedOs {
  scheduled: Map<string, { identifier: string; content: unknown; trigger: unknown }>;
  log: [op: string, id: string][];
  /** Returns a promise to suspend the named call until it resolves, or undefined to let it run. */
  hold?: (op: string, id: string) => Promise<void> | undefined;
  /** Called when the schedule list is read. */
  onRead?: () => void;
  /** Called when a channel is (re)registered — inside prepare(). */
  onChannel?: () => Promise<void> | void;
  kvWrites: number;
}

type Native = typeof import('../src/services/notifications.native');
type Replan = typeof import('../src/services/replan');

let loaded: { native: Native; replan: Replan } | null = null;

/** Loads the native service (and the re-plan module on top of it) once, behind the stand-ins. */
function load(): { native: Native; replan: Replan; os: ScriptedOs } {
  const g = globalThis as unknown as { __r18os: ScriptedOs };
  g.__r18os ??= { scheduled: new Map(), log: [], kvWrites: 0 };
  const os = g.__r18os;
  if (loaded) return { ...loaded, os };
  const root = path.resolve(__dirname, '..');
  const nativeUrl = pathToFileURL(path.join(root, 'src/services/notifications.native.ts')).href;
  const stubs: Record<string, string> = {
    'expo-notifications': `
      const os = globalThis.__r18os;
      exports.AndroidImportance = { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 };
      exports.AndroidNotificationVisibility = { PUBLIC: 1, PRIVATE: 0, SECRET: -1 };
      exports.SchedulableTriggerInputTypes = { DATE: 'date' };
      exports.PermissionStatus = { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' };
      exports.setNotificationHandler = () => {};
      exports.setNotificationChannelAsync = async () => { await os.onChannel?.(); };
      exports.setNotificationCategoryAsync = async () => {};
      exports.getAllScheduledNotificationsAsync = async () => { os.onRead?.(); return [...os.scheduled.values()].map((r) => ({ identifier: r.identifier, content: r.content, trigger: r.trigger })); };
      exports.cancelScheduledNotificationAsync = async (id) => { os.log.push(['cancel', id]); await os.hold?.('cancel', id); os.scheduled.delete(id); };
      exports.scheduleNotificationAsync = async (req) => { os.log.push(['schedule', req.identifier]); await os.hold?.('schedule', req.identifier); os.scheduled.set(req.identifier, req); return req.identifier; };
      exports.addNotificationResponseReceivedListener = () => ({ remove() {} });
      exports.getLastNotificationResponseAsync = async () => null;
      exports.clearLastNotificationResponseAsync = async () => {};
    `,
    'expo-background-task': `exports.BackgroundTaskStatus = { Available: 1 }; exports.getStatusAsync = async () => 1; exports.registerTaskAsync = async () => {};`,
    'expo-task-manager': `exports.isTaskDefined = () => false; exports.defineTask = () => {};`,
    'expo-intent-launcher': `exports.ActivityAction = {}; exports.startActivityAsync = async () => {};`,
    'expo-constants': `exports.__esModule = true; exports.default = { expoConfig: { android: { package: 'app.test' } } };`,
    'react-native': `
      exports.Platform = { OS: 'android', Version: 34 };
      exports.PermissionsAndroid = { PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' }, check: async () => true };
      exports.Linking = { openSettings: async () => {} };
    `,
    '@/modules/exact-alarms': `exports.canScheduleExactAlarms = () => true;`,
    '@react-native-async-storage/async-storage': `
      const kv = new Map();
      exports.__esModule = true;
      exports.default = {
        getItem: async (k) => (kv.has(k) ? kv.get(k) : null),
        setItem: async (k, v) => { globalThis.__r18os.kvWrites += 1; kv.set(k, v); },
        removeItem: async (k) => { kv.delete(k); },
      };
    `,
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier in stubs) return { url: `r18:${specifier}`, shortCircuit: true };
      // The re-plan module imports the platform twin; here that is the native one under test.
      if (specifier === './notifications' && context.parentURL?.endsWith('/src/services/replan.ts')) return { url: nativeUrl, shortCircuit: true };
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith('r18:')) return { format: 'commonjs', shortCircuit: true, source: stubs[url.slice(4)] };
      return nextLoad(url, context);
    },
  });
  try {
    const requireHere = createRequire(path.join(root, 'package.json'));
    const native = requireHere('./src/services/notifications.native.ts') as Native;
    const replan = requireHere('./src/services/replan.ts') as Replan;
    loaded = { native, replan };
    return { native, replan, os };
  } finally {
    // The modules are in the require cache now; later requires of them need no hooks.
    hooks.deregister();
  }
}

const tick = () => new Promise<void>((r) => setImmediate(r));
const resetOs = (os: ScriptedOs) => {
  os.scheduled.clear();
  os.log.length = 0;
  os.hold = undefined;
  os.onRead = undefined;
  os.onChannel = undefined;
  os.kvWrites = 0;
};
const bellSchedules = (os: ScriptedOs) => os.log.filter(([op, id]) => op === 'schedule' && id === MIND_END_ID).length;

describe('the mind bell (LIFE18-3)', () => {
  it('a cancel that arrives while a schedule is still clearing the old bell wins: no bell is set', async () => {
    const { native, os } = load();
    resetOs(os);
    let release!: () => void;
    os.hold = (op, id) => (op === 'cancel' && id === MIND_END_ID ? new Promise<void>((r) => (release = r)) : undefined);
    const schedule = native.scheduleMindEnd(Date.now() + 60_000, 10, 'BREATHING');
    await tick();
    assert.deepEqual(os.log, [['cancel', MIND_END_ID]], 'the schedule is waiting on its cancel-before-schedule');
    os.hold = undefined;
    const cancel = native.cancelMindEnd();
    release();
    await Promise.all([schedule, cancel]);
    assert.equal(bellSchedules(os), 0, 'the superseded schedule never set the bell');
    assert.equal(os.scheduled.has(MIND_END_ID), false);
  });

  it('schedule → cancel → schedule leaves a bell; schedule → schedule → cancel leaves none', async () => {
    const { native, os } = load();
    resetOs(os);
    await Promise.all([native.scheduleMindEnd(Date.now() + 60_000, 5, 'MEDITATION'), native.cancelMindEnd(), native.scheduleMindEnd(Date.now() + 120_000, 2, 'BREATHING')]);
    assert.equal(os.scheduled.has(MIND_END_ID), true);
    assert.equal(bellSchedules(os), 1, 'only the last schedule reached the OS');
    resetOs(os);
    await Promise.all([native.scheduleMindEnd(Date.now() + 60_000, 5, 'MEDITATION'), native.scheduleMindEnd(Date.now() + 120_000, 2, 'BREATHING'), native.cancelMindEnd()]);
    assert.equal(os.scheduled.has(MIND_END_ID), false);
    assert.equal(bellSchedules(os), 0);
  });
});

const nudge = (id: string, at: number): ScheduledNudge => ({ id, at, day: '2026-10-26', habitIds: ['h'], title: 'Floss', body: 'Now', channel: 'nudges', kind: 'FIXED', actions: ['DONE', 'SNOOZE'] });

describe('a sync whose owner went away (LIFE18-5)', () => {
  it('is refused after the OS was read and before anything is written or scheduled', async () => {
    const { native, os } = load();
    resetOs(os);
    const nowMs = Date.now();
    let still = true;
    os.onRead = () => {
      still = false;
    };
    await assert.rejects(native.syncPlan([nudge('r18-gone', nowMs + 3_600_000)], nowMs, () => still), (err: Error) => err.name === 'SupersededError');
    assert.equal(os.kvWrites, 0, 'no bookkeeping was written');
    assert.equal(os.log.length, 0, 'nothing was cancelled or scheduled');
  });
  it('while a sync whose owner is still there schedules its plan', async () => {
    const { native, os } = load();
    resetOs(os);
    const nowMs = Date.now();
    await native.syncPlan([nudge('r18-here', nowMs + 3_600_000)], nowMs, () => true);
    assert.equal(os.scheduled.has('r18-here'), true);
    assert.ok(os.kvWrites > 0, 'the ledger was written');
  });
});

describe('a headless re-plan through a retired provider (LIFE18-7)', () => {
  const NY = 'America/New_York';
  const nowMs = Date.parse('2026-10-26T16:00:00Z'); // noon in New York
  const draft: HabitDraft = { name: 'Floss', category: 'body', type: 'YES_NO', unit: '', icon: 'check', cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 0, pinned: false };
  const reminder: NudgePolicy = { habitId: 'x', kind: 'FIXED', times: ['20:00'], onlyWhenBehind: false, maxPerDay: 1, enabled: true };
  const stateWith = (tapSizeMl: number): TrackerState => {
    const empty = buildEmptyState('2026-10-26');
    return reducer(reducer(empty, newHabitAction({ ...draft, reminder }, 'h', '2026-10-26')), { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true, tapSizeMl } });
  };
  const liveFor = (state: TrackerState, alive: () => boolean): LiveStore & { state: () => TrackerState } => {
    let current = state;
    return {
      state: () => current,
      current: () => current,
      committed: () => current,
      replaceSeq: () => 0,
      replacePending: () => false,
      alive,
      apply: async (build) => {
        if (!alive()) return { next: current, applied: false, persisted: false };
        const next = applyAll(current, build(current), reducer);
        const applied = next !== current;
        current = next;
        return { next, applied, persisted: true };
      },
    };
  };

  it('the plan is real: one ring this evening', () => {
    const plan = nudgePlan(stateWith(250), '2026-10-26', nowMs, NY);
    assert.ok(plan.some((n) => n.habitIds.includes('h') && n.at > nowMs), 'the fixture must produce a ring');
  });

  it('a provider retired while the sync prepared its channels never reaches the OS', async () => {
    const { replan, os } = load();
    resetOs(os);
    let alive = true;
    // A tap size this run has not prepared for yet, so prepare() really talks to the (scripted) OS.
    const live = liveFor(stateWith(333), () => alive);
    const ctx = replan.contextFor(live.current(), nowMs, NY);
    os.onChannel = () => {
      alive = false;
    };
    await assert.rejects(replan.replanLive(live, ctx), (err: Error) => err.name === 'SupersededError');
    assert.equal(os.log.filter(([op]) => op === 'schedule').length, 0, 'the retired provider scheduled nothing');
    assert.equal(os.scheduled.size, 0);
  });

  it('while a living provider puts its ring on the OS', async () => {
    const { replan, os } = load();
    resetOs(os);
    const live = liveFor(stateWith(250), () => true);
    const ctx = replan.contextFor(live.current(), nowMs, NY);
    await replan.replanLive(live, ctx);
    const planned = nudgePlan(live.current(), ctx.today, nowMs, NY).filter((n) => n.at > nowMs);
    assert.ok(planned.length > 0);
    for (const n of planned) assert.equal(os.scheduled.has(n.id), true, `${n.id} reached the OS`);
  });
});
