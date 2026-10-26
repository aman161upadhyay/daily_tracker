/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { instantOf } from '../src/domain/time/trackingDay';
import { applyAll, widgetTapActions, type CommandContext } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState } from '../src/state/seed';
import { activeHabits, todaySummary } from '../src/state/selectors';
import { widgetLayout } from '../src/widget/layout';
import { WIDGET_MAX_TILES, rotationHabit, shortVolume, widgetHabits, widgetModel, widgetModelKey } from '../src/widget/model';
import { ringSvg } from '../src/widget/ring';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `w${++seq}` };

function fresh() {
  return buildSampleState(TODAY, ZONE, NOW);
}

describe('widget model', () => {
  it('automatic mode shows water, the snack that is up next in the rotation, and mind', () => {
    const state = fresh();
    const habits = widgetHabits(state, TODAY);
    assert.equal(habits.length, WIDGET_MAX_TILES);
    assert.equal(habits[0]!.presetId, 'water');
    assert.equal(habits[1]!.id, rotationHabit(state, TODAY)!.id);
    assert.ok(habits[1]!.snackType, 'second tile is a movement snack');
    assert.ok(habits[2]!.mindKind, 'third tile is a mind habit');

    const model = widgetModel(state, TODAY, NOW, ZONE);
    assert.equal(model.day, TODAY);
    assert.deepEqual(model.tiles.map((t) => t.kind), ['water', 'rotation', 'habit']);
    const summary = todaySummary(state, TODAY, NOW, ZONE);
    assert.equal(model.tiles[0]!.value, shortVolume(summary.water.loggedMl, 'ml'));
    assert.equal(model.tiles[0]!.caption, 'of 2 L');
    assert.equal(model.tiles[1]!.value, String(summary.snacksDone));
    assert.equal(model.tiles[1]!.caption, `of ${summary.snacksTarget} snacks`);
    for (const t of model.tiles) {
      assert.ok(t.ratio >= 0 && t.ratio <= 1, `ratio clamped: ${t.ratio}`);
      assert.match(t.color, /^#/);
    }
  });

  it('chosen habits win, keep their order, and archived or unknown ids are skipped', () => {
    const state = fresh();
    const active = activeHabits(state);
    const [a, b] = [active[2]!, active[0]!];
    const chosen = reducer(state, { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: ['gone', a.id, b.id] } });
    assert.deepEqual(
      widgetHabits(chosen, TODAY).map((h) => h.id),
      [a.id, b.id],
    );
    // A chosen snack habit is a per-habit tile, not the rotation.
    const squats = active.find((h) => h.snackType === 'SQUATS' && h.presetId !== 'sugar-shield')!;
    const model = widgetModel(reducer(state, { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: [squats.id] } }), TODAY, NOW, ZONE);
    assert.equal(model.tiles.length, 1);
    assert.equal(model.tiles[0]!.kind, 'habit');
    assert.match(model.tiles[0]!.caption, /^of \d+ sets?$/);
  });

  it('a fresh install shows the water tile only; no habits at all shows nothing', () => {
    const water = buildEmptyState(TODAY);
    const model = widgetModel(water, TODAY, NOW, ZONE);
    assert.deepEqual(model.tiles.map((t) => t.kind), ['water']);
    assert.equal(model.tiles[0]!.value, '0 ml');
    const none = buildEmptyState(TODAY, undefined, { withWater: false });
    assert.equal(widgetModel(none, TODAY, NOW, ZONE).tiles.length, 0);
  });

  it('shows volumes short, in the chosen units', () => {
    assert.equal(shortVolume(750, 'ml'), '750 ml');
    assert.equal(shortVolume(1250, 'ml'), '1.3 L');
    assert.equal(shortVolume(2000, 'ml'), '2 L');
    assert.equal(shortVolume(1183, 'oz'), '40 oz');
    assert.equal(shortVolume(250, 'oz'), '8.5 oz');
    assert.equal(shortVolume(3000, 'oz'), '101 oz');
    const state = reducer(fresh(), { type: 'UPDATE_SETTINGS', patch: { units: 'oz' } });
    assert.match(widgetModel(state, TODAY, NOW, ZONE).tiles[0]!.caption, /^of \d+(\.\d)? oz$/);
  });

  it('the key changes when a value changes and not otherwise', () => {
    const state = fresh();
    const before = widgetModelKey(widgetModel(state, TODAY, NOW, ZONE));
    assert.equal(widgetModelKey(widgetModel(state, TODAY, NOW + 60_000, ZONE)), before);
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const next = applyAll(state, widgetTapActions(state, water.id, ctx), reducer);
    assert.notEqual(widgetModelKey(widgetModel(next, TODAY, NOW, ZONE)), before);
  });
});

describe('widget taps', () => {
  it('water adds one tap, tagged as a widget write', () => {
    const state = fresh();
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const next = applyAll(state, widgetTapActions(state, water.id, ctx), reducer);
    const added = next.water.filter((w) => !state.water.includes(w));
    assert.equal(added.length, 1);
    assert.equal(added[0]!.ml, state.settings.tapSizeMl);
    assert.equal(added[0]!.source, 'AUTO_WIDGET');
    assert.equal(added[0]!.day, TODAY);
  });

  it('the rotation tile logs the suggested snack with the WIDGET trigger and then suggests the next one', () => {
    const state = fresh();
    const up = rotationHabit(state, TODAY)!;
    const next = applyAll(state, widgetTapActions(state, up.id, ctx), reducer);
    const snack = next.snacks.at(-1)!;
    assert.equal(snack.type, up.snackType);
    assert.equal(snack.trigger, 'WIDGET');
    const after = rotationHabit(next, TODAY)!;
    const rotationSize = new Set(next.habits.filter((h) => h.snackType && h.presetId !== 'sugar-shield' && !h.archived).map((h) => h.id)).size;
    if (rotationSize > 1) assert.notEqual(after.id, up.id);
    assert.equal(widgetModel(next, TODAY, NOW, ZONE).tiles[1]!.habitId, after.id);
  });

  it('a yes/no habit toggles on once and ignores a second tap; unknown ids log nothing', () => {
    const state = fresh();
    const yesNo = state.habits.find((h) => h.type === 'YES_NO' && !h.archived);
    if (yesNo) {
      const first = widgetTapActions(state, yesNo.id, ctx);
      assert.equal(first.length, 1);
      const done = applyAll(state, first, reducer);
      assert.equal(widgetTapActions(done, yesNo.id, ctx).length, 0);
      assert.equal(widgetModel(reducer(done, { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: [yesNo.id] } }), TODAY, NOW, ZONE).tiles[0]!.value, '✓');
    }
    assert.deepEqual(widgetTapActions(state, 'nope', ctx), []);
    const archived = reducer(state, { type: 'UPDATE_HABIT', id: state.habits[0]!.id, patch: { archived: true } });
    assert.deepEqual(widgetTapActions(archived, state.habits[0]!.id, ctx), []);
  });
});

describe('widget layout and ring', () => {
  it('fits one tile on a 2×2, three on a 4×2, and goes inline on a one-row widget', () => {
    const small = widgetLayout(140, 140, 3);
    assert.equal(small.shown, 1);
    assert.equal(small.mode, 'stacked');
    assert.ok(small.ring >= 60, `big ring on a 2×2: ${small.ring}`);

    const wide = widgetLayout(300, 150, 3);
    assert.equal(wide.shown, 3);
    assert.equal(wide.mode, 'stacked');
    assert.ok(wide.ring >= 56 && wide.ring <= 92, `ring ${wide.ring}`);

    const row = widgetLayout(300, 70, 3);
    assert.equal(row.mode, 'inline');
    assert.equal(row.shown, 3);
    assert.ok(row.ring >= 36 && row.ring <= 46, `ring ${row.ring}`);

    assert.equal(widgetLayout(300, 150, 1).shown, 1);
    assert.equal(widgetLayout(300, 150, 0).shown, 0);
    assert.equal(widgetLayout(200, 150, 3).shown, 2);
  });

  it('draws a track and an arc proportional to the ratio, starting at 12 o’clock', () => {
    const svg = ringSvg({ size: 64, ratio: 0.5, color: '#1DB954' });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64" height="64"/);
    assert.equal((svg.match(/<circle/g) ?? []).length, 2);
    const [dash, total] = /stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(svg)!.slice(1).map(Number) as [number, number];
    assert.ok(Math.abs(dash - total / 2) < 0.01);
    assert.match(svg, /rotate\(-90 32 32\)/);
    assert.equal((ringSvg({ size: 64, ratio: 0, color: '#fff' }).match(/<circle/g) ?? []).length, 1);
    const full = /stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(ringSvg({ size: 64, ratio: 7, color: '#fff' }))!;
    assert.equal(full[1], full[2]);
  });
});
