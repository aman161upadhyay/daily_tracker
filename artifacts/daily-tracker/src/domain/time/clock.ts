/**
 * The only place the app reads the wall clock. Domain logic and services take
 * `now()` from here so tests can pin time.
 */
let nowProvider: () => number = () => Date.now();

export function now(): number {
  return nowProvider();
}

/** Test hook. Pass `null` to restore the real clock. */
export function setClock(provider: (() => number) | null): void {
  nowProvider = provider ?? (() => Date.now());
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
