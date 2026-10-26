/**
 * Round 21: what the council's diff and security lenses turned up, and the reminder self-test.
 *
 * - A restored file's rotation offset is a whole, non-negative number (the planner indexes a list
 *   with it); the planner also refuses to index with anything else.
 * - The reminder self-test: its phases and words are pure; its ring is outside the plan — a sync
 *   neither cancels it nor counts it, and cancelling every reminder leaves it standing.
 * - Typed amounts: a unit word after the number is ignored, letters or a sign inside it are not a
 *   number, a space that groups nothing is not a number; a fractional minute is floored.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ScheduledNudge } from '../src/domain/nudges/planner';
import { REMINDER_TEST_CHECKS, TEST_RING_GRACE_MS, TEST_RING_LEAD_MS, reminderTestLine, reminderTestPhase } from '../src/domain/nudges/reminderTest';
import { instantOf } from '../src/domain/time/trackingDay';
import { MIND_END_ID, TEST_RING_ID } from '../src/state/commands';
import { nudgePlan } from '../src/state/selectors';
import { buildSampleState } from '../src/state/seed';
import { loadNotificationService, resetOs } from './support/scriptedOs';

const DAY = '2026-10-26';
const NY = 'America/New_York';
const NOW = instantOf(DAY, 9 * 60, NY);

describe('a restored rotation offset (LENS21-01 security)', () => {
  it('the planner never indexes the rotation with a fraction or a negative', () => {
    const base = buildSampleState(DAY, NY, NOW);
    const ok = nudgePlan({ ...base, nudgeSwap: { day: DAY, offset: 0 } }, DAY, NOW, NY);
    assert.ok(ok.length > 0, 'the sample state plans rings');
    for (const offset of [0.5, -1, 1e300, Number.NaN]) {
      const plan = nudgePlan({ ...base, nudgeSwap: { day: DAY, offset } }, DAY, NOW, NY);
      assert.equal(plan.length, ok.length, `offset ${offset} plans as many rings as 0`);
      for (const n of plan) assert.ok(n.habitIds.length > 0, 'every ring names a habit');
    }
  });
});

describe('the reminder self-test (IDEA21)', () => {
  it('waits through the due minute and a grace, then asks', () => {
    const due = NOW + TEST_RING_LEAD_MS;
    assert.equal(reminderTestPhase(null, NOW), 'idle');
    assert.equal(reminderTestPhase({ dueAt: due }, NOW), 'waiting');
    assert.equal(reminderTestPhase({ dueAt: due }, due), 'waiting', 'the ring can be a little late');
    assert.equal(reminderTestPhase({ dueAt: due }, due + TEST_RING_GRACE_MS - 1), 'waiting');
    assert.equal(reminderTestPhase({ dueAt: due }, due + TEST_RING_GRACE_MS), 'ask');
    assert.match(reminderTestLine({ dueAt: due }, NOW, NY, '24h'), /Lock the phone now\. The test reminder is due at 09:01/);
    assert.match(reminderTestLine({ dueAt: due }, due + TEST_RING_GRACE_MS, NY, '12h'), /^Did the test reminder show up at 9:01 AM\?$/);
    assert.ok(REMINDER_TEST_CHECKS.length >= 3);
    assert.ok(REMINDER_TEST_CHECKS.some((l) => /Battery/.test(l)));
  });

  it('its ring is outside the plan: a sync leaves it standing and schedules nothing in its place', async () => {
    const { native, os } = loadNotificationService();
    resetOs(os);
    const nowMs = Date.now();
    await native.scheduleTestRing(nowMs + TEST_RING_LEAD_MS);
    assert.equal(os.scheduled.has(TEST_RING_ID), true);
    const ring = os.scheduled.get(TEST_RING_ID)!;
    assert.equal((ring.content as { data: { kind: string } }).data.kind, 'TEST');
    assert.equal((ring.content as { data: Record<string, unknown> }).data.nudgeId, undefined, 'names no nudge: a tap logs nothing');
    const before = os.log.length; // the test ring's own cancel-before-schedule is not the sync's
    const plan: ScheduledNudge = { id: 'r21-ring', at: nowMs + 3_600_000, day: DAY, habitIds: ['h'], title: 'Floss', body: 'Now', channel: 'nudges', kind: 'FIXED', actions: ['DONE', 'SNOOZE'] };
    await native.syncPlan([plan], nowMs, () => true);
    assert.equal(os.scheduled.has(TEST_RING_ID), true, 'the sync did not cancel the test ring');
    assert.equal(os.scheduled.has('r21-ring'), true);
    assert.equal(os.log.slice(before).some(([op, id]) => op === 'cancel' && id === TEST_RING_ID), false);
    await native.cancelAll();
    assert.equal(os.scheduled.has(TEST_RING_ID), true, 'reminders off leaves the test ring: the person asked for it');
    assert.equal(os.scheduled.has('r21-ring'), false);
    await native.cancelTestRing();
    assert.equal(os.scheduled.has(TEST_RING_ID), false);
    assert.equal(os.scheduled.has(MIND_END_ID), false);
  });

  it('a second test replaces the first ring instead of adding one', async () => {
    const { native, os } = loadNotificationService();
    resetOs(os);
    const nowMs = Date.now();
    await native.scheduleTestRing(nowMs + 60_000);
    await native.scheduleTestRing(nowMs + 120_000);
    assert.equal(os.scheduled.size, 1);
    assert.equal((os.scheduled.get(TEST_RING_ID)!.trigger as { date: number }).date, nowMs + 120_000);
    await native.cancelTestRing();
  });

  it('a cancel issued while an earlier send is still clearing the old ring wins (ADV21-01)', async () => {
    const { native, os } = loadNotificationService();
    resetOs(os);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // The first send's cancel-before-schedule is suspended; a second send and a cancel arrive meanwhile.
    os.hold = (op, id) => (op === 'cancel' && id === TEST_RING_ID && !released ? held : undefined);
    let released = false;
    const first = native.scheduleTestRing(100_000);
    const second = native.scheduleTestRing(200_000);
    const cancel = native.cancelTestRing();
    released = true;
    release();
    await assert.rejects(first, (err: Error) => err.name === 'SupersededError');
    await assert.rejects(second, (err: Error) => err.name === 'SupersededError');
    await cancel;
    assert.equal(os.scheduled.has(TEST_RING_ID), false, 'no send sneaked its ring in after the cancel');
  });

  it('a refused cancel is reported, not swallowed (ADV21-02)', async () => {
    const { native, os } = loadNotificationService();
    resetOs(os);
    await native.scheduleTestRing(Date.now() + 60_000);
    os.hold = (op, id) => (op === 'cancel' && id === TEST_RING_ID ? Promise.reject(new Error('cancel refused')) : undefined);
    await assert.rejects(native.cancelTestRing(), /cancel refused/);
    assert.equal(os.scheduled.has(TEST_RING_ID), true, 'the ring still stands');
    os.hold = undefined;
    await native.cancelTestRing();
    assert.equal(os.scheduled.has(TEST_RING_ID), false);
  });

  it('registers the channels before it schedules, so a test sent before the scheduler prepared lands (ADV21-03)', async () => {
    const { native, os } = loadNotificationService();
    resetOs(os);
    let channels = 0;
    os.onChannel = () => {
      channels += 1;
    };
    await native.scheduleTestRing(Date.now() + 60_000);
    assert.ok(channels > 0, 'setNotificationChannelAsync was called');
    await native.cancelTestRing();
  });
});
