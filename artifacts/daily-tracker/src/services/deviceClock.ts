import { getCalendars } from 'expo-localization';

/**
 * Whether the phone writes times as "21:30": Android's own "Use 24-hour format" switch (what
 * expo-localization reads through DateFormat.is24HourFormat), falling back to the locale's
 * convention when the platform cannot say. Read at start and on every foreground — the person may
 * flip the switch while the app is in the background — and resolved against Settings → Time
 * format by `resolveClockFormat`.
 */
export function deviceUses24h(): boolean {
  try {
    const calendar = getCalendars()[0];
    if (calendar && typeof calendar.uses24hourClock === 'boolean') return calendar.uses24hourClock;
  } catch {
    // fall through to the locale's convention
  }
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h23' || cycle === 'h24';
  } catch {
    return false;
  }
}
