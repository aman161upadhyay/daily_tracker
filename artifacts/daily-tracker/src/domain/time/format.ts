import { parseDay } from './trackingDay';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The weekday's name for a `weekdayOf` index (Monday = 0 … Sunday = 6); out-of-range values read as Sunday. */
export function weekdayName(index: number): string {
  return WEEKDAYS_LONG[((Math.trunc(index) % 7) + 7) % 7] ?? 'Sunday';
}
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
/** How a clock time is written: "9:30 PM" or "21:30". Resolved once from the setting and the phone. */
export type ClockFormat = '12h' | '24h';

/**
 * The format in force: the explicit setting, or the phone's own 24-hour switch (Android's
 * "Use 24-hour format", read at the platform boundary) when the setting says "system".
 */
export function resolveClockFormat(preference: 'system' | ClockFormat, deviceUses24h: boolean): ClockFormat {
  if (preference === 'system') return deviceUses24h ? '24h' : '12h';
  return preference;
}

/** "9:30 PM" / "12:05 AM", or "21:30" / "00:05" in the 24-hour format. */
export function formatClock(minutesOfDay: number, clock: ClockFormat): string {
  const m = ((minutesOfDay % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const mm = `${min < 10 ? '0' : ''}${min}`;
  if (clock === '24h') return `${h24 < 10 ? '0' : ''}${h24}:${mm}`;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${suffix}`;
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
 * A habit's value in the unit the person reads: the Water preset is stored in ml and shown in the
 * units setting (ounces with one decimal); every other habit keeps its own unit. One helper for the
 * rows, the detail screen, the editor and the charts, so "oz" never shows next to a figure in ml.
 */
export function formatHabitValue(habit: { presetId?: string; unit: string }, value: number, units: 'ml' | 'oz'): { value: string; unit: string } {
  if (habit.presetId === 'water') return formatVolume(value, units);
  return { value: formatNumber(value), unit: habit.unit };
}

/** `formatHabitValue` as one string: "8.5 oz", "10 squats", "3" (no unit). */
export function habitAmountText(habit: { presetId?: string; unit: string }, value: number, units: 'ml' | 'oz'): string {
  const f = formatHabitValue(habit, value, units);
  return `${f.value} ${f.unit}`.trim();
}

/** The unit word a habit's figures carry: the units setting for the Water preset, its own otherwise. */
export function habitUnit(habit: { presetId?: string; unit: string }, units: 'ml' | 'oz'): string {
  return habit.presetId === 'water' ? units : habit.unit;
}

/**
 * Digits and separators as other keyboards write them, folded to ASCII: Arabic-Indic (٠–٩) and
 * Persian (۰–۹) digits, the Arabic decimal (٫) and thousands (٬) marks, the French narrow space
 * between groups (dropped: a space is never a decimal mark, so "1 850,5" reads as 1850,5). One
 * place, so every parser reads every keyboard.
 */
function asciiDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',')
    .replace(/(\d)[\u202f\u00a0 ](?=\d{3}(?!\d))/g, '$1');
}

/**
 * A typed number, however the keyboard wrote it: "64", "8.5", "1,850", "1,5" (a decimal-comma
 * keyboard), "2.000" (a decimal-point keyboard's thousands dot), "1,850.5", "1.850,5", "٢٥٠".
 * A lone separator that groups exactly three digits is a thousands separator — "1,850" and
 * "2.000" are volumes in ml far more often than 1.85 or 2.000 of anything — and a decimal mark
 * otherwise; with both kinds present the last one is the decimal mark. A stray unit word is
 * ignored. Returns null when nothing numeric was typed. Every sheet and stepper parses through
 * here, so the same text means the same number everywhere.
 */
export function parseDecimalInput(text: string): number | null {
  let t = asciiDigits(text).replace(/[^\d.,]/g, '').replace(/[.,]+$/, '');
  if (!/\d/.test(t)) return null; // "oz", "", "  ": nothing typed yet, keep the current value
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both kinds: the one that comes last is the decimal mark, the other groups thousands.
    const decimal = lastDot > lastComma ? '.' : ',';
    t = t.replace(decimal === '.' ? /,/g : /\./g, '').replace(',', '.');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(t)) {
    t = t.replace(/[.,]/g, ''); // "1,850", "2.000", "1.250.000"
  } else {
    // One kind of separator, not a thousands grouping: a single decimal mark. Two of them
    // ("1.2.3", or "1.250.0" on the way to "1.250.000") is nothing yet — the stepper keeps the
    // current value instead of reading 1.23 and jumping to 1 then 1,250,000 keystroke by keystroke.
    if ((t.match(/[.,]/g) ?? []).length > 1) return null;
    t = t.replace(',', '.');
  }
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

/** "2,000 ml a day" (or "67.6 oz a day" in ounces), "10 squats · 6 sets a day", "3 days a week", "Every day". */
export function describeRule(
  habit: { type: 'YES_NO' | 'COUNT' | 'AMOUNT' | 'TIMER'; unit: string; presetId?: string },
  rule: { cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'; timesPerPeriod: number; target: number },
  units: 'ml' | 'oz' = 'ml',
): string {
  const period = rule.cadence === 'WEEKLY' ? 'week' : 'month';
  const cadence = rule.cadence === 'DAILY' ? 'a day' : `${rule.timesPerPeriod} day${rule.timesPerPeriod === 1 ? '' : 's'} a ${period}`;
  if (habit.type === 'YES_NO') return rule.cadence === 'DAILY' ? 'Every day' : cadence;
  const amount = habitAmountText(habit, rule.target, units);
  return rule.cadence === 'DAILY' ? `${amount} ${cadence}` : `${amount} on ${cadence}`;
}
