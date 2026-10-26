/**
 * Round 14: the pinned-card list, day ratios past the heatmap's reach, readable inks on the
 * category colours, one handler per press (the claim gate), and the save queue's retry and
 * ownership rules — a retired provider writes nothing more.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import colors from '../constants/colors';
import { contrastRatio, inkFor, readableFill } from '../src/domain/color/oklch';
import { DEFAULT_PINNED, PINNED_CARD_IDS, movePinned, sanitizePinned, setPinned } from '../src/domain/today/pinned';
import { ClaimGate } from '../src/services/claimGate';
import { SaveQueue } from '../src/state/saveQueue';
import { buildEmptyState } from '../src/state/seed';
import { heatmapValues, ratiosByDay } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const TODAY = '2026-10-26';
const ZONE = 'America/New_York';

describe('pinned cards', () => {
  it('sanitizes a saved list: known ids, each once, cycle always present, default for junk', () => {
    assert.deepEqual(sanitizePinned(['mind', 'water', 'bogus', 'water', 'steps']), ['mind', 'water', 'steps', 'cycle']);
    assert.deepEqual(sanitizePinned('nope'), [...DEFAULT_PINNED]);
    assert.deepEqual(sanitizePinned(undefined), [...DEFAULT_PINNED]);
    assert.deepEqual(sanitizePinned([]), ['cycle']);
    for (const id of PINNED_CARD_IDS) assert.ok(sanitizePinned([id]).includes(id));
  });

  it('turns cards on (appended last) and off; the cycle card is never removed', () => {
    const base = ['water', 'cycle'] as const;
    assert.deepEqual(setPinned(base, 'sleep', true), ['water', 'cycle', 'sleep']);
    assert.deepEqual(setPinned(base, 'water', false), ['cycle']);
    assert.deepEqual(setPinned(base, 'cycle', false), ['water', 'cycle']);
    assert.deepEqual(setPinned(['water'], 'cycle', true), ['water', 'cycle']);
    assert.deepEqual(setPinned(base, 'water', true), ['cycle', 'water'], 'turning an on card on again moves it last');
  });

  it('moves a card one step, no-op at the ends and for an unknown position', () => {
    const list = ['water', 'snacks', 'mind'] as const;
    assert.deepEqual(movePinned(list, 'mind', -1), ['water', 'mind', 'snacks']);
    assert.deepEqual(movePinned(list, 'water', 1), ['snacks', 'water', 'mind']);
    assert.deepEqual(movePinned(list, 'water', -1), [...list]);
    assert.deepEqual(movePinned(list, 'mind', 1), [...list]);
    assert.deepEqual(movePinned(list, 'sleep', 1), [...list]);
  });
});

describe('day ratios for the picker', () => {
  const base = buildEmptyState(TODAY);
  const water = base.habits.find((h) => h.presetId === 'water')!;
  const old = '2026-02-10'; // 258 days back: past the 26-week heatmap
  const state: TrackerState = {
    ...base,
    habits: base.habits.map((h) => (h.id === water.id ? { ...h, createdDay: '2026-01-15' } : h)),
    water: [{ id: 'w1', at: Date.UTC(2026, 1, 10, 17, 0, 0), zone: ZONE, day: old, ml: base.settings.waterGoalMl, source: 'MANUAL' }],
  };
  const habit = state.habits.find((h) => h.id === water.id)!;

  it('answers for days beyond the heatmap strip, and not before the habit existed', () => {
    assert.equal(heatmapValues(state, habit, TODAY)[old], undefined, 'the strip does not reach February');
    const ratios = ratiosByDay(state, habit, ['2026-01-10', '2026-01-15', old, '2026-02-11']);
    assert.equal(ratios['2026-01-10'], undefined, 'before the habit was added');
    assert.equal(ratios['2026-01-15'], 0);
    assert.equal(ratios[old], 1);
    assert.equal(ratios['2026-02-11'], 0);
  });
});

describe('ink on category colours', () => {
  it('measures contrast the WCAG way', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 0.01);
    assert.ok(Math.abs(contrastRatio('#FFFFFF', '#FFFFFF') - 1) < 0.01);
    assert.equal(inkFor('#111111', ['#000000', '#FFFFFF']), '#FFFFFF');
    assert.equal(inkFor('#EEEEEE', ['#000000', '#FFFFFF']), '#000000');
  });

  it('a full day in the picker reads at AA on every category colour, in both themes', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const c = colors[scheme];
      for (const [key, hex] of Object.entries(c.cat)) {
        const ink = inkFor(hex, [c.text, c.bg]);
        const fill = readableFill(hex, ink);
        assert.ok(contrastRatio(fill, ink) >= 4.5, `${scheme} ${key} ${hex}: fill ${fill} with ink ${ink} reaches ${contrastRatio(fill, ink).toFixed(2)}`);
        // The adjusted fill stays the same colour: hue within a few degrees, lightness moved as little as needed.
        const near = Math.abs(contrastRatio(hex, ink) - contrastRatio(fill, ink)) < 1.5 || contrastRatio(hex, ink) >= 4.5;
        assert.ok(near, `${scheme} ${key}: moved from ${contrastRatio(hex, ink).toFixed(2)} to ${contrastRatio(fill, ink).toFixed(2)}`);
      }
    }
    assert.equal(readableFill('#FFFFFF', '#000000'), '#FFFFFF', 'untouched when it already reads');
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('claim gate', () => {
  it('answers a second caller only once the first claim is written, with false', async () => {
    const gate = new ClaimGate();
    const write = deferred<boolean>();
    let writes = 0;
    const first = gate.begin('k', () => {
      writes += 1;
      return write.promise;
    });
    let secondSettled = false;
    const second = gate.begin('k', async () => {
      writes += 1;
      return true;
    }).then((v) => {
      secondSettled = true;
      return v;
    });
    await tick();
    assert.equal(secondSettled, false, 'the duplicate waits for the inbox write');
    write.resolve(true);
    assert.equal(await first, true);
    assert.equal(await second, false);
    assert.equal(writes, 1, 'one claim written');
    assert.equal(gate.has('k'), true);
    gate.end('k');
    assert.equal(gate.has('k'), false);
  });

  it('lets the second caller claim when the first write failed, and releases a handled-before press', async () => {
    const gate = new ClaimGate();
    const first = gate.begin('k', () => Promise.reject(new Error('disk')));
    const second = gate.begin('k', async () => true);
    await assert.rejects(first, /disk/);
    assert.equal(await second, true, 'the failed claim was released; the duplicate owns the press');
    gate.end('k');

    let writes = 0;
    const handledBefore = () => {
      writes += 1;
      return Promise.resolve(false);
    };
    assert.equal(await gate.begin('h', handledBefore), false);
    assert.equal(gate.has('h'), false, 'nothing to end: an earlier process handled it');
    assert.equal(await gate.begin('h', handledBefore), false);
    assert.equal(writes, 2);
  });
});

describe('save queue', () => {
  const s0 = buildEmptyState(TODAY);
  const s1: TrackerState = { ...s0, settings: { ...s0.settings, name: 'A' } };
  const s2: TrackerState = { ...s1, settings: { ...s1.settings, name: 'B' } };

  function fakeStore() {
    const calls: { kind: 'persist' | 'replace'; base?: TrackerState; target: TrackerState }[] = [];
    let next: Promise<void> | null = null;
    return {
      calls,
      /** The next write waits on this promise (one shot). */
      hold(p: Promise<void>) {
        next = p;
      },
      store: {
        persist: (base: TrackerState, target: TrackerState) => {
          calls.push({ kind: 'persist', base, target });
          const p = next ?? Promise.resolve();
          next = null;
          return p;
        },
        replace: (target: TrackerState) => {
          calls.push({ kind: 'replace', target });
          const p = next ?? Promise.resolve();
          next = null;
          return p;
        },
      },
    };
  }

  function timers() {
    const scheduled: { fn: () => void; ms: number; cancelled: boolean }[] = [];
    return {
      scheduled,
      schedule: (fn: () => void, ms: number) => {
        const t = { fn, ms, cancelled: false };
        scheduled.push(t);
        return t;
      },
      cancel: (h: unknown) => {
        (h as { cancelled: boolean }).cancelled = true;
      },
    };
  }

  it('writes one diff per pass from the committed base and settles waiters by generation', async () => {
    const f = fakeStore();
    const q = new SaveQueue({}, timers());
    q.attach(f.store, s0, 0);
    assert.equal(await q.commitPending(0), true);
    q.setTarget(s1, 1);
    const wait = q.commitPending(1);
    assert.equal(await q.flush(), true);
    assert.equal(await wait, true);
    assert.deepEqual(f.calls.map((x) => x.kind), ['persist']);
    assert.equal(f.calls[0]!.base, s0);
    assert.equal(q.committed, s1);
    assert.equal(q.committedGen, 1);
  });

  it('retries a failed write from the same base, then lets the waiter through', async () => {
    const f = fakeStore();
    const t = timers();
    const saved: boolean[] = [];
    const q = new SaveQueue({ onFailed: (_e, retrying) => saved.push(retrying) }, { ...t, maxRetries: 2 });
    q.attach(f.store, s0, 0);
    q.setTarget(s1, 1);
    f.hold(Promise.reject(new Error('locked')));
    const wait = q.commitPending(1);
    assert.equal(await q.flush(), false);
    assert.deepEqual(saved, [true]);
    assert.equal(t.scheduled.length, 1);
    assert.equal(q.committed, s0, 'the base did not move');
    t.scheduled[0]!.fn();
    assert.equal(await wait, true);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1]!.base, s0, 'retried from the same base');
    assert.equal(q.failures, 0);
  });

  it('a retired queue schedules no retry, starts no pass and answers waiters false (no resurrected write)', async () => {
    const f = fakeStore();
    const t = timers();
    const q = new SaveQueue({}, t);
    q.attach(f.store, s0, 0);
    q.setTarget(s1, 1);
    const inFlight = deferred<void>();
    f.hold(inFlight.promise);
    const wait = q.commitPending(1);
    const pass = q.flush();
    // Unmounted (the error boundary's reset) while the write is still running; then the write fails.
    q.dispose();
    assert.equal(await wait, false);
    inFlight.reject(new Error('disk full'));
    assert.equal(await pass, false);
    assert.equal(t.scheduled.length, 0, 'no retry timer for a retired provider');
    assert.equal(await q.flush(), false);
    assert.equal(await q.commitPending(1), false);
    assert.equal(f.calls.length, 1, 'the one write that was already in flight, nothing after');
    assert.equal(q.attached, false);
  });

  it('cancels a pending retry on dispose, and a retry that fires anyway writes nothing', async () => {
    const f = fakeStore();
    const t = timers();
    const q = new SaveQueue({}, t);
    q.attach(f.store, s0, 0);
    q.setTarget(s1, 1);
    f.hold(Promise.reject(new Error('locked')));
    assert.equal(await q.flush(), false);
    assert.equal(t.scheduled.length, 1);
    q.dispose();
    assert.equal(t.scheduled[0]!.cancelled, true);
    t.scheduled[0]!.fn(); // a timer the platform fired regardless
    await tick();
    assert.equal(f.calls.length, 1);
  });

  it('writes a replacement with replace, then reports it committed', async () => {
    const f = fakeStore();
    let committed = 0;
    const q = new SaveQueue({ onReplaceCommitted: () => (committed += 1) }, timers());
    q.attach(f.store, s0, 0);
    q.setTarget(s1, 1);
    q.markReplace(2);
    q.setTarget(s2, 2);
    assert.equal(q.replacePending, true);
    assert.equal(await q.flush(), true);
    assert.deepEqual(f.calls.map((x) => x.kind), ['replace']);
    assert.equal(f.calls[0]!.target, s2);
    assert.equal(q.replacePending, false);
    assert.equal(committed, 1);
  });

  it('out of retries: waiters get false, and a new caller gets exactly one more attempt', async () => {
    const f = fakeStore();
    const t = timers();
    const q = new SaveQueue({}, { ...t, maxRetries: 1 });
    q.attach(f.store, s0, 0);
    q.setTarget(s1, 1);
    const early = q.commitPending(1);
    f.hold(Promise.reject(new Error('a')));
    assert.equal(await q.flush(), false);
    f.hold(Promise.reject(new Error('b')));
    t.scheduled[0]!.fn();
    await tick();
    assert.equal(await early, false, 'gave up after the retries');
    assert.equal(t.scheduled.length, 1, 'no further timer');
    const again = q.commitPending(1);
    await tick();
    assert.equal(f.calls.length, 3, 'one more attempt for the new caller');
    assert.equal(await again, true);
    assert.equal(q.committed, s1);
  });
});
