/**
 * Round 20: what the council's diff, locale and performance lenses turned up.
 *
 * - An archived Library preset added again keeps its history and takes the reminder chosen in the
 *   sheet (or keeps its own schedule when none was chosen).
 * - Typed amounts fold every keyboard: Arabic-Indic digits, a comma or a dot as the decimal mark,
 *   thousands separators ("12,000", "2.000", "1.850,5").
 * - Clock times follow one explicit format ("9:30 PM" or "21:30") threaded through every writer,
 *   resolved from Settings → Time format and the phone's own switch.
 * - The encrypted export's key derivation yields to the event loop; the async and sync forms read
 *   each other's files.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decryptBackup, decryptBackupAsync, encryptBackup, encryptBackupAsync } from '../src/data/backupCrypto';
import { normalizeSettings } from '../src/data/store';
import type { NudgePolicy } from '../src/domain/models';
import { describePolicy, nextRingText, policyFromDraft, shortPolicyText, timesText } from '../src/domain/nudges/describePolicy';
import { formatClock, parseClockInput, parseDecimalInput, resolveClockFormat } from '../src/domain/time/format';
import { instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID, PRESETS, presetNudgeText, presetRuleText, presetText, presetWhy } from '../src/library/presets';
import { SNACK_LABELS } from '../src/domain/models';
import { snackSuggestion } from '../src/state/selectors';
import { presetHabitAction, restorePresetActions } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState } from '../src/state/seed';
import { highlights, policyFor } from '../src/state/selectors';

const DAY = '2026-10-26'; // a Monday
const NY = 'America/New_York';

describe('restorePresetActions', () => {
  const added = reducer(buildEmptyState(DAY), presetHabitAction(PRESET_BY_ID['strength-session'], 'h1', DAY));
  const archived = reducer(added, { type: 'UPDATE_HABIT', id: 'h1', patch: { archived: true } });
  const habit = archived.habits.find((h) => h.id === 'h1')!;

  it('brings an archived preset back with its own schedule when nothing was chosen', () => {
    const actions = restorePresetActions(archived, habit);
    assert.deepEqual(actions, [{ type: 'UPDATE_HABIT', id: 'h1', patch: { archived: false } }]);
    const back = actions.reduce(reducer, archived);
    assert.equal(back.habits.find((h) => h.id === 'h1')!.archived, false);
    assert.deepEqual(policyFor(back, 'h1')?.times, ['18:00'], 'the preset reminder it had is kept');
  });

  it('saves a chosen reminder onto the restored habit, re-addressed', () => {
    const chosen = policyFromDraft({ habitId: 'new' }, { mode: 'FIXED', times: ['07:00'], weekdays: [1, 3], intervalMin: 120, onlyWhenBehind: false, maxPerDay: 1 }, { movement: false, water: false });
    const back = restorePresetActions(archived, habit, chosen).reduce(reducer, archived);
    const policy = policyFor(back, 'h1');
    assert.equal(policy?.habitId, 'h1');
    assert.deepEqual(policy?.times, ['07:00']);
    assert.deepEqual(policy?.weekdays, [1, 3]);
    assert.equal(back.habits.find((h) => h.id === 'h1')!.archived, false);
  });

  it('does nothing to a habit that is already active and had no new reminder', () => {
    assert.deepEqual(restorePresetActions(added, added.habits.find((h) => h.id === 'h1')!), []);
  });

  it('an on-demand preset keeps its trigger whatever was chosen', () => {
    const withShield = reducer(buildEmptyState(DAY), presetHabitAction(PRESET_BY_ID['sugar-shield'], 'h2', DAY));
    const archivedShield = reducer(withShield, { type: 'UPDATE_HABIT', id: 'h2', patch: { archived: true } });
    const chosen: NudgePolicy = { habitId: 'new', kind: 'FIXED', times: ['09:00'], onlyWhenBehind: false, maxPerDay: 1, enabled: true };
    const actions = restorePresetActions(archivedShield, archivedShield.habits.find((h) => h.id === 'h2')!, chosen);
    assert.deepEqual(actions, [{ type: 'UPDATE_HABIT', id: 'h2', patch: { archived: false } }]);
    assert.equal(policyFor(actions.reduce(reducer, archivedShield), 'h2')?.kind, 'EVENT');
  });
});

describe('parseDecimalInput folds every keyboard', () => {
  it('reads plain, comma-decimal and grouped numbers', () => {
    assert.equal(parseDecimalInput('1850'), 1850);
    assert.equal(parseDecimalInput('1,5'), 1.5, 'a comma is the decimal mark where that is the custom');
    assert.equal(parseDecimalInput('8.5'), 8.5);
    assert.equal(parseDecimalInput('12,000 ml'), 12000, 'a lone separator before exactly three digits groups thousands');
    assert.equal(parseDecimalInput('2.000'), 2000);
    assert.equal(parseDecimalInput('1.850,5'), 1850.5, 'both marks present: the last one is the decimal');
    assert.equal(parseDecimalInput('1,850.5'), 1850.5);
    assert.equal(parseDecimalInput('12 000'), 12000, 'a space between digit groups is a thousands separator');
    assert.equal(parseDecimalInput('1 850,5'), 1850.5);
  });

  it('reads Arabic-Indic and Persian digits and their separators', () => {
    assert.equal(parseDecimalInput('٢٥٠'), 250);
    assert.equal(parseDecimalInput('۱۲٫۵'), 12.5);
    assert.equal(parseDecimalInput('١٬٨٥٠'), 1850);
  });

  it('keeps refusing what is not a number', () => {
    assert.equal(parseDecimalInput(''), null);
    assert.equal(parseDecimalInput('abc'), null);
    assert.equal(parseDecimalInput('1.2.3'), null);
    assert.equal(parseDecimalInput('2.'), 2, 'a trailing separator is dropped while typing');
    assert.equal(parseDecimalInput('1,5,'), 1.5);
    assert.equal(parseDecimalInput('64 oz'), 64, 'a unit word after the number is ignored');
    assert.equal(parseDecimalInput('1.5l'), 1.5);
    assert.equal(parseDecimalInput('1e3'), null, 'letters inside are not a number');
    assert.equal(parseDecimalInput('-5'), null, 'a sign is not a number here');
    assert.equal(parseDecimalInput('0x10'), null);
    assert.equal(parseDecimalInput('1 2 3'), null, 'a space that groups nothing');
    assert.equal(parseDecimalInput('12 00'), null);
    assert.equal(parseDecimalInput(' 1 '), 1);
    assert.equal(formatClock(90.7, '24h'), '01:30', 'a fractional minute is floored');
  });
});

describe('clock format', () => {
  it('resolves the setting against the phone', () => {
    assert.equal(resolveClockFormat('system', true), '24h');
    assert.equal(resolveClockFormat('system', false), '12h');
    assert.equal(resolveClockFormat('24h', false), '24h');
    assert.equal(resolveClockFormat('12h', true), '12h');
  });

  it('writes the same minute both ways', () => {
    assert.equal(formatClock(7 * 60 + 5, '24h'), '07:05');
    assert.equal(formatClock(7 * 60 + 5, '12h'), '7:05 AM');
    assert.equal(formatClock(12 * 60, '24h'), '12:00');
    assert.equal(formatClock(12 * 60, '12h'), '12:00 PM');
    assert.equal(formatClock(23 * 60 + 59, '24h'), '23:59');
    assert.equal(formatClock(24 * 60, '24h'), '00:00', 'wraps at midnight');
  });

  it('reads what it writes in either format', () => {
    for (const minute of [0, 5, 9 * 60 + 30, 12 * 60, 13 * 60 + 45, 23 * 60 + 59]) {
      assert.equal(parseClockInput(formatClock(minute, '24h')), minute);
      assert.equal(parseClockInput(formatClock(minute, '12h')), minute);
    }
  });

  it('the policy words and the next-ring line follow it', () => {
    const ctx = { movement: false, water: false, rotationIntervalMin: 60, clock: '24h' as const };
    const policy: NudgePolicy = { habitId: 'h', kind: 'FIXED', times: ['19:00', '08:00'], onlyWhenBehind: false, maxPerDay: 2, enabled: true };
    assert.equal(timesText(['19:00', '08:00'], '24h'), '08:00 and 19:00');
    assert.equal(describePolicy(policy, ctx), 'At 08:00 and 19:00');
    assert.equal(describePolicy(policy, { ...ctx, clock: '12h' }), 'At 8:00 AM and 7:00 PM');
    const base = { plan: [{ at: instantOf(DAY, 19 * 60, NY), day: DAY, habitIds: ['h'] }], habitId: 'h', policy, remindersEnabled: true, today: DAY, zone: NY, doneToday: false, donePeriod: false, periodNoun: 'day' as const };
    assert.equal(nextRingText({ ...base, clock: '24h' }), 'Next: today at 19:00');
    assert.equal(nextRingText({ ...base, clock: '12h' }), 'Next: today at 7:00 PM');
    const paused = nextRingText({ ...base, clock: '24h', nowMs: instantOf(DAY, 8 * 60, NY), offUntil: instantOf(DAY, 14 * 60 + 30, NY) });
    assert.equal(paused, 'Paused until today at 14:30 (Settings → Reminders).');
  });

  it("Today's row hint comes from the habit's own policy, in the time format", () => {
    const ctx = { movement: false, water: false, rotationIntervalMin: 60, clock: '24h' as const };
    const fixed: NudgePolicy = { habitId: 'h', kind: 'FIXED', times: ['19:00', '08:00', '12:30'], onlyWhenBehind: false, maxPerDay: 3, enabled: true };
    assert.equal(shortPolicyText(fixed, ctx), 'At 08:00 +2');
    assert.equal(shortPolicyText(fixed, { ...ctx, clock: '12h' }), 'At 8:00 AM +2');
    assert.equal(shortPolicyText({ ...fixed, times: ['07:30'], weekdays: [0, 1, 2, 3, 4] }, ctx), 'At 07:30 on weekdays');
    assert.equal(shortPolicyText({ habitId: 'h', kind: 'INTERVAL', intervalMin: 90, onlyWhenBehind: true, maxPerDay: 8, enabled: true }, { ...ctx, water: true }), 'Every 1 h 30 min when behind');
    assert.equal(shortPolicyText({ habitId: 'h', kind: 'ROTATION', onlyWhenBehind: false, maxPerDay: 6, enabled: true }, { ...ctx, movement: true }), 'Rotation');
    assert.equal(shortPolicyText({ habitId: 'h', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false }, ctx), undefined);
    assert.equal(shortPolicyText(undefined, ctx), undefined);
  });

  it("the Library's reminder lines write their clock tokens in the time format", () => {
    assert.equal(presetNudgeText(PRESET_BY_ID['journal'], '12h'), 'At 9:30 PM');
    assert.equal(presetNudgeText(PRESET_BY_ID['journal'], '24h'), 'At 21:30');
    assert.equal(presetNudgeText(PRESET_BY_ID['stair-sprint'], '24h'), 'At 10:30, 14:30 and 16:30 until 3 days are logged this week');
    assert.equal(presetNudgeText(PRESET_BY_ID['stair-sprint'], '12h'), 'At 10:30 AM, 2:30 PM and 4:30 PM until 3 days are logged this week');
    for (const preset of PRESETS) {
      assert.doesNotMatch(presetNudgeText(preset, '24h'), /\b(AM|PM)\b|[{}]/, `${preset.id} under the 24-hour clock`);
      assert.doesNotMatch(presetNudgeText(preset, '12h'), /[{}]/, `${preset.id} has an unwritten token`);
    }
  });

  it('the setting survives a file and junk falls back to the phone', () => {
    assert.equal(normalizeSettings({ clockFormat: '24h' }).clockFormat, '24h');
    assert.equal(normalizeSettings({ clockFormat: '12h' }).clockFormat, '12h');
    assert.equal(normalizeSettings({}).clockFormat, 'system');
    assert.equal(normalizeSettings({ clockFormat: 'military' as never }).clockFormat, 'system');
  });
});

describe('encrypted export, async key derivation', () => {
  const plaintext = JSON.stringify({ app: 'daily-tracker', hello: 'world', n: 42 });
  const password = 'correct horse';

  it('round-trips, and reads the sync form (and vice versa)', async () => {
    const asyncFile = await encryptBackupAsync(plaintext, password, { iterations: 2_000 });
    assert.equal(await decryptBackupAsync(asyncFile, password), plaintext);
    assert.equal(decryptBackup(asyncFile, password), plaintext, 'the sync reader opens an async-written file');
    const syncFile = encryptBackup(plaintext, password, { iterations: 2_000 });
    assert.equal(await decryptBackupAsync(syncFile, password), plaintext, 'the async reader opens a sync-written file');
  });

  it('refuses a wrong password the same way', async () => {
    const file = await encryptBackupAsync(plaintext, password, { iterations: 2_000 });
    await assert.rejects(() => decryptBackupAsync(file, 'wrong password'));
  });

  it('yields to the event loop while deriving the key', async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    try {
      await encryptBackupAsync(plaintext, password, { iterations: 200_000 });
    } finally {
      clearInterval(timer);
    }
    assert.ok(ticks > 0, `the timer ran ${ticks} times during the derivation`);
  });
});

describe('volumes follow the units setting everywhere they are written', () => {
  it('the Library preset texts write their millilitre tokens in the chosen unit', () => {
    assert.equal(presetRuleText(PRESET_BY_ID['water'], 'ml'), '2,000 ml a day');
    assert.equal(presetRuleText(PRESET_BY_ID['water'], 'oz'), '67.6 oz a day');
    assert.match(presetWhy(PRESET_BY_ID['water'], 'ml'), /2,700 ml \(women\) to 3,700 ml \(men\)/);
    assert.match(presetWhy(PRESET_BY_ID['water'], 'oz'), /91.3 oz \(women\) to 125.1 oz \(men\)/);
    assert.doesNotMatch(presetWhy(PRESET_BY_ID['water'], 'oz'), /\bml\b/);
    assert.equal(presetText('no tokens here', 'oz'), 'no tokens here');
    for (const preset of Object.values(PRESET_BY_ID)) {
      assert.doesNotMatch(presetRuleText(preset, 'oz'), /\bml\b/, `${preset.id} rule text under ounces`);
      assert.doesNotMatch(presetWhy(preset, 'oz'), /\bml\b/, `${preset.id} why under ounces`);
      assert.doesNotMatch(presetText(preset.ruleText, 'ml'), /[{}]/, `${preset.id} has an unwritten token`);
    }
  });

  it('the water highlight reads in ounces when ounces are set', () => {
    const nowMs = instantOf(DAY, 12 * 60, NY);
    const sample = buildSampleState(DAY, NY, nowMs);
    const inMl = highlights(sample, DAY).find((h) => h.id === 'water-week');
    const inOz = highlights(reducer(sample, { type: 'UPDATE_SETTINGS', patch: { units: 'oz' } }), DAY).find((h) => h.id === 'water-week');
    assert.ok(inMl && inOz, 'the sample state has a water week');
    assert.match(inMl.body, /^[\d,]+ ml a day on average\./);
    assert.match(inOz.body, /^[\d.]+ oz a day on average\./);
  });
});

describe('a stair snack is one climb', () => {
  it('counts one towards the three a day the preset asks for', () => {
    assert.equal(SNACK_LABELS.STAIRS.defaultReps, 1);
    assert.equal(snackSuggestion('STAIRS'), '1 stair climb');
    assert.equal(PRESET_BY_ID['stair-sprint'].rule.target, 3);
    assert.equal(PRESET_BY_ID['stair-sprint'].unit, 'climbs');
  });
});
