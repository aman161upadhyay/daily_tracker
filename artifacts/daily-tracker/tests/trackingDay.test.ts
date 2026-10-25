/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, calendarDayOf, dayDiff, lastNDays, minutesOfDay, trackingDayOf, weekdayOf, weekStartOf } from '../src/domain/time/trackingDay';

const NY = 'America/New_York';

describe('trackingDayOf', () => {
  it('uses the calendar day after the 3 am boundary', () => {
    // 2026-10-25 10:00 EDT = 14:00 UTC
    const t = Date.UTC(2026, 9, 25, 14, 0);
    assert.equal(trackingDayOf(t, NY), '2026-10-25');
    assert.equal(calendarDayOf(t, NY), '2026-10-25');
  });

  it('counts 00:30 local as the previous tracking day', () => {
    // 2026-10-26 00:30 EDT = 04:30 UTC
    const t = Date.UTC(2026, 9, 26, 4, 30);
    assert.equal(calendarDayOf(t, NY), '2026-10-26');
    assert.equal(trackingDayOf(t, NY), '2026-10-25');
  });

  it('flips exactly at the boundary hour', () => {
    const before = Date.UTC(2026, 9, 26, 6, 59); // 02:59 EDT
    const after = Date.UTC(2026, 9, 26, 7, 0); // 03:00 EDT
    assert.equal(trackingDayOf(before, NY), '2026-10-25');
    assert.equal(trackingDayOf(after, NY), '2026-10-26');
  });

  it('respects a custom boundary hour (midnight)', () => {
    const t = Date.UTC(2026, 9, 26, 4, 30); // 00:30 EDT
    assert.equal(trackingDayOf(t, NY, 0), '2026-10-26');
  });

  it('handles the fall-back DST night (Nov 1 2026, 1 am happens twice)', () => {
    // 01:30 EDT (first) = 05:30 UTC; 01:30 EST (second) = 06:30 UTC; both before 3 am → Oct 31.
    assert.equal(trackingDayOf(Date.UTC(2026, 10, 1, 5, 30), NY), '2026-10-31');
    assert.equal(trackingDayOf(Date.UTC(2026, 10, 1, 6, 30), NY), '2026-10-31');
    // 03:00 EST = 08:00 UTC → Nov 1.
    assert.equal(trackingDayOf(Date.UTC(2026, 10, 1, 8, 0), NY), '2026-11-01');
  });

  it('handles the spring-forward night (Mar 8 2026, 2 am is skipped)', () => {
    // 01:59 EST = 06:59 UTC → before boundary → Mar 7
    assert.equal(trackingDayOf(Date.UTC(2026, 2, 8, 6, 59), NY), '2026-03-07');
    // 03:00 EDT = 07:00 UTC → Mar 8 (the clock jumps from 1:59 to 3:00)
    assert.equal(trackingDayOf(Date.UTC(2026, 2, 8, 7, 0), NY), '2026-03-08');
  });

  it('works in a zone east of UTC', () => {
    // 2026-10-26 02:00 IST = 2026-10-25 20:30 UTC
    const t = Date.UTC(2026, 9, 25, 20, 30);
    assert.equal(calendarDayOf(t, 'Asia/Kolkata'), '2026-10-26');
    assert.equal(trackingDayOf(t, 'Asia/Kolkata'), '2026-10-25');
  });
});

describe('day arithmetic', () => {
  it('adds days across month and year ends', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  });

  it('is immune to DST when counting days', () => {
    assert.equal(dayDiff('2026-10-25', '2026-11-08'), 14);
    assert.equal(lastNDays('2026-11-02', 3).join(','), '2026-10-31,2026-11-01,2026-11-02');
  });

  it('knows weekdays (Monday = 0)', () => {
    assert.equal(weekdayOf('2026-10-25'), 6); // Sunday
    assert.equal(weekdayOf('2026-10-26'), 0); // Monday
    assert.equal(weekStartOf('2026-10-25'), '2026-10-19');
    assert.equal(weekStartOf('2026-10-26'), '2026-10-26');
  });

  it('computes minutes of day in the zone', () => {
    assert.equal(minutesOfDay(Date.UTC(2026, 9, 25, 14, 5), NY), 10 * 60 + 5);
  });
});
