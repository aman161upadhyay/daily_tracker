import { parseDay } from './trackingDay';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ',';
  }
  return sign + out;
}

/** "Sunday, Oct 25" */
export function formatDayLong(day: string): string {
  const { year, month, day: d } = parseDay(day);
  const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
  const weekday = WEEKDAYS_LONG[(js + 6) % 7];
  return `${weekday}, ${MONTHS_SHORT[month - 1]} ${d}`;
}

/** "Oct 25" */
export function formatDayShort(day: string): string {
  const { month, day: d } = parseDay(day);
  return `${MONTHS_SHORT[month - 1]} ${d}`;
}

/** "Mon" */
export function formatWeekdayShort(day: string): string {
  const { year, month, day: d } = parseDay(day);
  const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
  return WEEKDAYS_SHORT[(js + 6) % 7] ?? '';
}

/** Minutes after midnight → "9:41 AM" */
export function formatClock(minutesOfDay: number): string {
  const m = ((minutesOfDay % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min < 10 ? '0' : ''}${min} ${suffix}`;
}

/**
 * A typed clock time → minutes of day, or null. Accepts "9", "9:30", "0930", "930", "21:15",
 * "2115" and an optional am/pm ("9:30 pm", "930p"). Digits without a colon read as HHMM when there
 * are three or more, as an hour otherwise. Hours 0–23 (12-hour with a suffix), minutes 0–59.
 */
export function parseClockInput(text: string): number | null {
  const t = text.trim().toLowerCase();
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/.exec(t) ?? /^(\d{1,2})(\d{2})\s*([ap])?\.?m?\.?$/.exec(t);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  const suffix = m[3];
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) return null;
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (suffix === 'p' ? 12 : 0);
  } else if (hours > 23) return null;
  return hours * 60 + minutes;
}

/** "in 24 min", "in 1 h 10 min", "now" */
export function formatIn(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}

/** 125 → "2:05" */
export function formatMinSec(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function mlToOz(ml: number): number {
  return ml / 29.5735;
}

export function ozToMl(oz: number): number {
  return oz * 29.5735;
}

/** A number with at most one decimal, thousands grouped: 8.5, 12, 1,850.3. */
export function formatOneDecimal(n: number): string {
  const tenths = Math.round(n * 10);
  const whole = Math.trunc(tenths / 10);
  const frac = Math.abs(tenths % 10);
  const sign = tenths < 0 && whole === 0 ? '-' : '';
  return frac === 0 ? `${sign}${formatNumber(whole)}` : `${sign}${formatNumber(whole)}.${frac}`;
}

/**
 * A volume in the display unit. Ounces keep one decimal (250 ml is 8.5 oz, not "8"): a glass
 * rounded to the ounce drifts by up to 15 ml every time it is shown, logged or offered as a button.
 */
export function formatVolume(ml: number, units: 'ml' | 'oz'): { value: string; unit: string } {
  if (units === 'oz') return { value: formatOneDecimal(mlToOz(ml)), unit: 'oz' };
  return { value: formatNumber(ml), unit: 'ml' };
}

/**
 * A typed number, however the keyboard wrote it: "64", "8.5", "1,850", "1,5" (a decimal-comma
 * keyboard), "1,850.5". A comma is a thousands separator when it groups exactly three digits with
 * no point in sight — "1,850" is a volume in ml far more often than 1.85 of anything — and a decimal
 * point otherwise. A stray unit word is ignored. Returns null when nothing numeric was typed.
 * Every sheet and stepper parses through here, so the same text means the same number everywhere.
 */
export function parseDecimalInput(text: string): number | null {
  let t = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null; // "oz", "", "  ": nothing typed yet, keep the current value
  if (t.includes('.')) t = t.replace(/,/g, '');
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.').replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A typed volume in the display unit, as ml: "64", "64 oz", "1,850 ml". The number is read in the
 * unit the stepper shows (ounces when the app is in ounces).
 */
export function parseVolumeInput(text: string, units: 'ml' | 'oz'): number | null {
  const n = parseDecimalInput(text);
  if (n === null) return null;
  return units === 'oz' ? Math.round(ozToMl(n)) : Math.round(n);
}

/** "2,000 ml a day", "10 squats · 6 sets a day", "3 days a week", "Every day". */
export function describeRule(
  habit: { type: 'YES_NO' | 'COUNT' | 'AMOUNT' | 'TIMER'; unit: string },
  rule: { cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'; timesPerPeriod: number; target: number },
): string {
  const period = rule.cadence === 'WEEKLY' ? 'week' : 'month';
  const cadence = rule.cadence === 'DAILY' ? 'a day' : `${rule.timesPerPeriod} day${rule.timesPerPeriod === 1 ? '' : 's'} a ${period}`;
  if (habit.type === 'YES_NO') return rule.cadence === 'DAILY' ? 'Every day' : cadence;
  const amount = `${formatNumber(rule.target)} ${habit.unit}`.trim();
  return rule.cadence === 'DAILY' ? `${amount} ${cadence}` : `${amount} on ${cadence}`;
}
