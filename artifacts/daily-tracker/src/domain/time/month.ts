/** Calendar months as "YYYY-MM" strings, for month grids. */
import { addDays, toDayString, weekdayOf } from './trackingDay';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "October 2026" */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** The month laid out Monday-first: leading and trailing blanks are null, whole weeks always. */
export function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = toDayString(y, m, 1);
  const lead = weekdayOf(first);
  const n = daysInMonth(month);
  const out: (string | null)[] = [];
  for (let i = 0; i < lead; i++) out.push(null);
  for (let d = 0; d < n; d++) out.push(addDays(first, d));
  while (out.length % 7 !== 0) out.push(null);
  return out;
}
