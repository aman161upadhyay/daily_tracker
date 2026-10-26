/**
 * Counters bumped when the user withdraws something, so work that started
 * before the bump (a Health Connect read in flight, a snapshot about to be
 * written) can tell it must not land. Per JavaScript runtime: the app and the
 * headless tasks that run alongside it share these; a headless task on its own
 * runtime has nobody to race.
 */
let body = 0;

/** Bumped by Disconnect / Remove imported data / Erase / Restore: an older read must not add rows. */
export function bodyEpoch(): number {
  return body;
}

export function bumpBodyEpoch(): number {
  body += 1;
  return body;
}
