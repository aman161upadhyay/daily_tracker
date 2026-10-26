/**
 * Tracking-day clock.
 *
 * A "tracking day" starts at a configurable boundary hour (default 3 am local
 * time) instead of midnight, so a glass of water at 00:30 still counts for the
 * evening it belongs to. Habits, water and movement snacks use the tracking
 * day; cycle data and clock-time reminders use the calendar day.
 *
 * Days are plain `YYYY-MM-DD` strings. Arithmetic on them is done in UTC so it
 * is immune to DST transitions.
 */

export const DEFAULT_BOUNDARY_HOUR = 3;

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(zone, f);
  }
  return f;
}

/** Local wall-clock components of an instant in a given IANA zone. */
export function wallClock(instantMs: number, zone: string): WallClock {
  const parts = formatterFor(zone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toDayString(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseDay(day: string): { year: number; month: number; day: number } {
  const [y, m, d] = day.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

/** Calendar day (midnight boundary) of an instant in a zone. */
export function calendarDayOf(instantMs: number, zone: string): string {
  const w = wallClock(instantMs, zone);
  return toDayString(w.year, w.month, w.day);
}

/** Tracking day of an instant: the calendar day, shifted back one day before the boundary hour. */
export function trackingDayOf(
  instantMs: number,
  zone: string,
  boundaryHour: number = DEFAULT_BOUNDARY_HOUR,
): string {
  const w = wallClock(instantMs, zone);
  const day = toDayString(w.year, w.month, w.day);
  return w.hour < boundaryHour ? addDays(day, -1) : day;
}

/** Minutes since local midnight (0-1439). */
export function minutesOfDay(instantMs: number, zone: string): number {
  const w = wallClock(instantMs, zone);
  return w.hour * 60 + w.minute;
}

export function addDays(day: string, n: number): string {
  const { year, month, day: d } = parseDay(day);
  const t = Date.UTC(year, month - 1, d + n);
  const dt = new Date(t);
  return toDayString(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Signed number of days from `a` to `b` (b - a). */
export function dayDiff(a: string, b: string): number {
  const pa = parseDay(a);
  const pb = parseDay(b);
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

/** The `n` days ending with `endDay`, oldest first. */
export function lastNDays(endDay: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endDay, -i));
  return out;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(day: string): number {
  const { year, month, day: d } = parseDay(day);
  const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay(); // 0 = Sunday
  return (js + 6) % 7;
}

/** The person's first day of the week (Settings → Day & cycle). Monday is the default; most of the US counts from Sunday. */
export type WeekStart = 'monday' | 'sunday';

/** Index of the week's first day in `weekdayOf` terms: Monday = 0, Sunday = 6. */
export function weekStartIndex(start: WeekStart | undefined): number {
  return start === 'sunday' ? 6 : 0;
}

/** Index of the week's last day: Sunday for Monday-first weeks, Saturday for Sunday-first. */
export function weekEndIndex(start: WeekStart | undefined): number {
  return (weekStartIndex(start) + 6) % 7;
}

/** First day of the week containing `day`; `start` is the week's first weekday (`weekStartIndex`), Monday by default. */
export function weekStartOf(day: string, start = 0): string {
  return addDays(day, -((weekdayOf(day) - start + 7) % 7));
}

/**
 * Bounds for an epoch-ms instant this app will format: from 1970 to the end of year 9999. A finite
 * number outside them (an imported `at` of 1e300, a forged timer payload) is still a "number", but
 * `new Date(ms)` is invalid and every Intl call on it throws — so the bound is checked wherever a
 * timestamp enters from outside (import files, notification payloads).
 */
export const MIN_INSTANT_MS = 0;
export const MAX_INSTANT_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

export function isInstantMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= MIN_INSTANT_MS && v <= MAX_INSTANT_MS;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as this app writes it: "2026-02-28" yes, "2026-02-30" or "2026-99-99" no. */
export function isCalendarDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
  const { year, month, day } = parseDay(v);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** Offset of `zone` from UTC at an instant, in ms (local − UTC). */
export function zoneOffsetAt(instantMs: number, zone: string): number {
  const w = wallClock(instantMs, zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Epoch ms of a wall-clock minute on a calendar day in `zone`. Used to stamp
 * backfilled logs inside the day they belong to and to place clock-time reminders.
 * A minute the clock shows twice (the repeated hour when DST ends) resolves to
 * its first occurrence; a minute the clock skips (the missing hour when DST
 * starts) resolves to the instant the clock jumps to — 02:30 on a spring-forward
 * night is 03:30, never 01:30 the hour before.
 */
export function instantOf(day: string, minute: number, zone: string): number {
  const { year, month, day: d } = parseDay(day);
  const guess = Date.UTC(year, month - 1, d, 0, minute);
  const first = guess - zoneOffsetAt(guess, zone);
  const offset = zoneOffsetAt(first, zone);
  const result = guess - offset;
  // The offset in force at the result must be the one used to compute it; when it is not, the
  // requested minute falls in a gap, and `first` (computed with the pre-transition offset) is
  // the moment the clock lands on after skipping it.
  return zoneOffsetAt(result, zone) === offset ? result : first;
}
