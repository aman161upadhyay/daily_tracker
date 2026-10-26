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
    if (!zone || zone.length === 0) return 'UTC';
    // A runtime can hand back a name it cannot itself format with ("Etc/Unknown" on some Android
    // builds); every tracking-day formatter downstream would throw on it, so it is tried here.
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric' }).format(0);
    return zone;
  } catch {
    return 'UTC';
  }
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
