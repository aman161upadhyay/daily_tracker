/**
 * Round 26: what the council's diff, journey and Android-platform lenses turned up.
 *
 * - The widget file must stay out of the React Compiler: the widget library calls its components as
 *   plain functions, and a compiled component's first line is a hook call that throws there. The
 *   file is compiled here the way Metro compiles it for a release build.
 * - A Retry in Your data retries the delete that failed, not a wider one: a set-aside cleanup must
 *   leave the current phone-backup copy alone.
 * - The nudge card does not call set-time movement reminders "off".
 * - "Start fresh" keeps the water goal in both of its homes (the setting and the habit's target).
 * - "Days met" counts inside the span it names: sessions logged before a habit existed are its
 *   history, but "14 of last 1" is not a thing a person can have done.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { adherenceSpan, daysMet } from '../src/domain/habits/progress';
import { addDays, instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { backupFailure, reportBackup, setBackupFailure } from '../src/services/backupHealth';
import type { NudgePolicy } from '../src/domain/models';
import { presetHabitAction } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { fixedMovementReminders, habitView, rotationItems } from '../src/state/selectors';

const NY = 'America/New_York';
const MON = '2026-10-26';

const require = createRequire(import.meta.url);
const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Compile a source file the way Metro does for an Android release build with the React Compiler on. */
async function compileLikeMetro(filename: string, source: string): Promise<string> {
  const expoDir = path.dirname(require.resolve('expo/package.json', { paths: [APP_DIR] }));
  const preset = createRequire(path.join(expoDir, 'package.json')).resolve('babel-preset-expo');
  // Typed by hand: @babel/core ships no types here and the test needs one function of it.
  const babel = require('@babel/core') as { transformAsync: (code: string, options: Record<string, unknown>) => Promise<{ code?: string | null } | null> };
  const out = await babel.transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[preset, {}]],
    caller: { name: 'metro', platform: 'android', supportsReactCompiler: true, isDev: false, bundler: 'metro', isReactServer: false, isServer: false },
  });
  assert.ok(out?.code, 'babel produced no code');
  return out.code;
}

describe('round 26 — the widget file and the React Compiler', () => {
  it('a component without the opt-out is compiled (the harness has the compiler on)', async () => {
    const probe = `import React from 'react';\nexport function Probe({ n }: { n: number }) { const items = [n, n + 1]; return <>{items.map((x) => <b key={x}>{x}</b>)}</>; }\n`;
    const code = await compileLikeMetro(path.join(APP_DIR, 'src/widget/Probe.tsx'), probe);
    assert.match(code, /compiler-runtime/);
  });

  it('TrackerWidget.tsx compiles with no compiler runtime in it: its components stay plain functions', async () => {
    const file = path.join(APP_DIR, 'src/widget/TrackerWidget.tsx');
    const source = readFileSync(file, 'utf8');
    assert.match(source.split('\n')[0]!, /^'use no memo';/, 'the opt-out directive must be the first line');
    const code = await compileLikeMetro(file, source);
    assert.doesNotMatch(code, /compiler-runtime/);
    assert.doesNotMatch(code, /_compilerRuntime\.c\)/);
  });
});

describe('round 26 — a Retry retries the delete that failed', () => {
  it('a delete of everything clears a failed set-aside cleanup; nothing else crosses over', () => {
    setBackupFailure(null);
    reportBackup('delete-kept', new Error('EBUSY'));
    assert.equal(backupFailure()?.what, 'delete-kept');
    reportBackup('delete', null);
    assert.equal(backupFailure(), null, 'everything went, the set-aside copies with it');

    reportBackup('delete', new Error('EBUSY'));
    reportBackup('delete-kept', null);
    assert.equal(backupFailure()?.what, 'delete', 'removing the set-aside copies says nothing about the current one');

    reportBackup('write', new Error('ENOSPC'));
    reportBackup('delete', null);
    reportBackup('delete-kept', null);
    assert.equal(backupFailure()?.what, 'write', 'a delete clears no write failure');
    reportBackup('write', null);
    assert.equal(backupFailure(), null);
  });
});

describe('round 26 — set-time movement reminders are not "off"', () => {
  const fixedAt15 = (habitId: string): NudgePolicy => ({ habitId, kind: 'FIXED', times: ['15:00'], onlyWhenBehind: false, maxPerDay: 1, enabled: true });

  it('counts the FIXED ones the rotation leaves out, and only those that are on', () => {
    let state = buildEmptyState(MON, undefined, { withWater: false });
    state = reducer(state, { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true } });
    state = reducer(state, presetHabitAction(PRESET_BY_ID['walk-break']!, 'h_walk', MON, fixedAt15('h_walk')));
    assert.equal(state.policies.find((p) => p.habitId === 'h_walk')?.kind, 'FIXED');
    assert.equal(rotationItems(state).length, 0, 'a set-time reminder is not in the rotation');
    assert.equal(fixedMovementReminders(state), 1);

    const paused = reducer(state, { type: 'SET_POLICY', policy: { ...state.policies.find((p) => p.habitId === 'h_walk')!, enabled: false } });
    assert.equal(fixedMovementReminders(paused), 0, 'a paused set-time reminder is off');

    const withRotation = reducer(state, presetHabitAction(PRESET_BY_ID['squat-snack']!, 'h_squats', MON));
    assert.equal(rotationItems(withRotation).length, 1);
    assert.equal(fixedMovementReminders(withRotation), 1);

    const shield = reducer(state, presetHabitAction(PRESET_BY_ID['sugar-shield']!, 'h_shield', MON, fixedAt15('h_shield')));
    assert.equal(fixedMovementReminders(shield), 1, 'the Sugar Shield is not a movement reminder');
  });
});

describe('round 26 — Start fresh keeps the water goal in both of its homes', () => {
  it('the new Water habit takes the kept setting as its target', () => {
    const before = buildEmptyState(MON);
    const kept = { ...before.settings, waterGoalMl: 3000, onboardingDone: true };
    const fresh = buildEmptyState(MON, kept);
    const water = fresh.habits.find((h) => h.presetId === 'water')!;
    const rule = fresh.rules.find((r) => r.habitId === water.id)!;
    assert.equal(rule.target, 3000);
    assert.equal(fresh.settings.waterGoalMl, 3000);
    assert.equal(habitView(fresh, water, MON).target, 3000);

    const lower = buildEmptyState(MON, { ...before.settings, waterGoalMl: 1500 });
    assert.equal(lower.rules.find((r) => r.habitId === lower.habits[0]!.id)!.target, 1500);
    assert.equal(before.rules[0]!.target, before.settings.waterGoalMl, 'the default is still one number too');
  });
});

describe('round 26 — "Days met" stays inside the span it names', () => {
  it('a Meditate habit added after forty days of Quick Log sessions shows at most 1 of last 1', () => {
    const first = '2026-09-17';
    let state = buildEmptyState(first, undefined, { withWater: false });
    state = reducer(state, { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true, dayBoundaryHour: 4 } });
    for (let i = 0; i < 40; i++) {
      const day = addDays(first, i);
      const endAt = instantOf(day, 21 * 60, NY);
      state = reducer(state, { type: 'LOG_MIND', session: { id: `late-${i}`, startAt: endAt - 13 * 60_000, endAt, zone: NY, day, kind: 'MEDITATION', minutes: 13 } });
    }
    const adopted = addDays(first, 39);
    state = reducer(state, presetHabitAction(PRESET_BY_ID.meditate!, 'late-meditation', adopted));
    const habit = state.habits.find((h) => h.id === 'late-meditation')!;
    const view = habitView(state, habit, adopted);
    const span = adherenceSpan(habit.createdDay, adopted);
    assert.equal(span.days, 1);
    assert.ok(daysMet(view.ratios14) > 1, 'the fourteen-day strip still carries the earlier sessions');
    const shown = daysMet(view.ratios14.slice(-span.days));
    assert.ok(shown <= span.days, `${shown} of last ${span.days}`);
    assert.equal(shown, 1);
  });
});
