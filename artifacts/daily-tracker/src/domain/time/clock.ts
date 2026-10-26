/**
 * The only place the app reads the wall clock. Domain logic takes an instant as an argument (the
 * tests pass their own); services and screens read it here.
 */
export function now(): number {
  return Date.now();
}

export function currentZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.length > 0 ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
