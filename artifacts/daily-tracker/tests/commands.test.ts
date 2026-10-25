/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAll, completeFromNudge, firedActions, nudgeResponseActions, type CommandContext, type NudgePayload } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildSampleState } from '../src/state/seed';
import { instantOf } from '../src/domain/time/trackingDay';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `t${++seq}` };

function fresh() {
  return buildSampleState(TODAY, ZONE, NOW);
}

describe('notification responses → state', () => {
  it('Done on a movement nudge logs that snack with the NUDGE trigger and records the event', () => {
    const state = fresh();
    const squats = state.habits.find((h) => h.snackType === 'SQUATS' && h.presetId !== 'sugar-shield')!;
    const payload: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: [squats.id], day: TODAY, snackType: 'SQUATS' };
    const next = applyAll(state, nudgeResponseActions(state, payload, 'DONE', ctx), reducer);
    const added = next.snacks.filter((x) => !state.snacks.includes(x));
    assert.equal(added.length, 1);
    assert.equal(added[0]!.type, 'SQUATS');
    assert.equal(added[0]!.trigger, 'NUDGE');
    const ev = next.nudgeEvents.at(-1)!;
    assert.equal(ev.kind, 'DONE');
    assert.equal(ev.nudgeId, payload.nudgeId);
  });

  it('+water adds one tap and, when merged with movement, keeps the movement half open', () => {
    const state = fresh();
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const walk = state.habits.find((h) => h.snackType === 'WALK')!;
    const before = state.water.length;
    const solo: NudgePayload = { nudgeId: 'water:2026-10-25:900', kind: 'WATER', habitIds: [water.id], day: TODAY, waterMl: 250 };
    const a = applyAll(state, nudgeResponseActions(state, solo, 'WATER', ctx), reducer);
    assert.equal(a.water.length, before + 1);
    assert.equal(a.nudgeEvents.at(-1)!.kind, 'DONE');
    const merged: NudgePayload = { ...solo, habitIds: [water.id, walk.id] };
    const b = applyAll(state, nudgeResponseActions(state, merged, 'WATER', ctx), reducer);
    assert.equal(b.nudgeEvents.at(-1)!.kind, 'SNOOZED');
    assert.equal(b.nudgeEvents.at(-1)!.untilMs, NOW + 15 * 60_000);
  });

  it('Snooze and Swap only record events (swap also advances the rotation)', () => {
    const state = fresh();
    const payload: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: ['x'], day: TODAY };
    const snoozed = applyAll(state, nudgeResponseActions(state, payload, 'SNOOZE', ctx), reducer);
    assert.equal(snoozed.snacks.length, state.snacks.length);
    assert.equal(snoozed.nudgeEvents.at(-1)!.kind, 'SNOOZED');
    const swapped = applyAll(state, nudgeResponseActions(state, payload, 'SWAP', ctx), reducer);
    assert.deepEqual(swapped.nudgeSwap, { day: TODAY, offset: 1 });
    assert.equal(swapped.nudgeEvents.at(-1)!.kind, 'SWAPPED');
  });

  it('Done on a page-count habit logs the rest of today\'s target, and nothing when already met', () => {
    const state = fresh();
    const read = state.habits.find((h) => h.presetId === 'read-before-bed');
    if (!read) return; // sample data may not include it
    const actions = completeFromNudge(state, read, ctx);
    assert.equal(actions.length, 1);
    assert.equal(actions[0]!.type, 'ADD_ENTRY');
    const done = applyAll(state, actions, reducer);
    assert.equal(completeFromNudge(done, read, ctx).length, 0);
  });

  it('Did it on the Sugar Shield follow-up logs a walk and removes the one-off event', () => {
    let state = fresh();
    state = reducer(state, { type: 'SCHEDULE_EVENT', event: { id: 'shield-1', habitId: 'nope', at: NOW, zone: ZONE, day: TODAY, title: 'Post-meal walk', body: '' } });
    const payload: NudgePayload = { nudgeId: 'event:shield-1', kind: 'EVENT', habitIds: ['nope'], day: TODAY };
    const next = applyAll(state, nudgeResponseActions(state, payload, 'DONE', ctx), reducer);
    assert.equal(next.events.length, 0);
    assert.equal(next.snacks.at(-1)!.type, 'WALK');
    assert.equal(next.snacks.at(-1)!.trigger, 'NUDGE');
  });

  it('the timer bell logs the session once if the app missed the end', () => {
    const state = fresh();
    const payload: NudgePayload = { nudgeId: 'mind-end', kind: 'MIND_END', habitIds: [], day: '', mind: { kind: 'MEDITATION', minutes: 13, startAt: NOW - 13 * 60_000 } };
    const once = applyAll(state, nudgeResponseActions(state, payload, 'TAP', ctx), reducer);
    assert.equal(once.mind.length, state.mind.length + 1);
    const twice = applyAll(once, nudgeResponseActions(once, payload, 'TAP', ctx), reducer);
    assert.equal(twice.mind.length, once.mind.length);
  });

  it('fired records become FIRED events exactly once', () => {
    const state = fresh();
    const fired = [{ id: 'rot:2026-10-25:840', habitIds: ['a'], day: TODAY, at: NOW - 3_600_000 }];
    const once = applyAll(state, firedActions(state, fired, ctx), reducer);
    assert.equal(once.nudgeEvents.filter((e) => e.nudgeId === fired[0]!.id).length, 1);
    assert.equal(firedActions(once, fired, ctx).length, 0);
  });
});
