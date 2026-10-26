/**
 * What the OS delivered, kept until the state that records it is saved.
 *
 * The sync learns about a delivery once: the ledger entry whose alarm is no longer pending is
 * reported as fired and dropped from the ledger in the same write. If the fold of that report into
 * the state is lost — the save fails, Android kills the process between the two writes — the slot
 * is never written down: the planner re-offers it (a second ring for a snooze the person already
 * dismissed) and the daily cap is spent a slot late. So every report also lands in a journal,
 * written before the ledger is replaced, and is removed only once the caller says the state that
 * holds it is on disk. Until then each reconcile folds the journal again; the fold dedupes by
 * occurrence (slot id and time), so a replay changes nothing.
 *
 * Pure (no native imports) so the unit tests cover it.
 */

export interface FiredRecord {
  id: string;
  habitIds: string[];
  day: string;
  at: number;
  /** A merged notification: every slot id it stood for. */
  mergedIds?: string[];
}

/** What we last handed to the OS; `sig` changes when the time, the text or the alarm precision changes. */
export type LedgerEntry = FiredRecord & { sig: string };

/** How long an overdue, still-pending alarm is left alone before it is treated as lost. */
export const OVERDUE_GRACE_MS = 30 * 60_000;

/** A journal entry older than this is dropped: the nudge events it would produce are pruned anyway. */
export const JOURNAL_RETENTION_MS = 3 * 24 * 3_600_000;

/** One delivery is one occurrence of a slot at a time. */
export const occurrenceKey = (r: Pick<FiredRecord, 'id' | 'at'>) => `${r.id}|${r.at}`;

/**
 * Split the ledger into what rang and what is overdue yet still pending. Without exact-alarm
 * access (the Android 14+ default) an alarm may still be pending minutes after its time. Such an
 * entry has not fired: it is left scheduled for a while rather than cancelled and counted against
 * the daily cap as if the person had seen it.
 *
 * An entry that is no longer pending rang, whatever the clock says now: the OS removes a one-shot
 * request only when it delivers it (or when we cancel it, which rewrites the ledger in the same
 * breath). After the clock is set back, a delivered entry's time lies in the "future"; judging it
 * by the time would hide that ring until the clock caught up and re-offer the slot meanwhile.
 */
export function deliveries(ledger: LedgerEntry[], pending: ReadonlySet<string>, nowMs: number): { fired: FiredRecord[]; overdueKept: LedgerEntry[] } {
  const overdueKept = ledger.filter((e) => e.at <= nowMs && pending.has(e.id) && e.at > nowMs - OVERDUE_GRACE_MS);
  const fired = ledger.filter((e) => !pending.has(e.id)).map(({ sig: _sig, ...f }) => f);
  return { fired, overdueKept };
}

/** The journal with new deliveries added (once each) and stale entries dropped. */
export function journalWith(journal: FiredRecord[], fired: FiredRecord[], nowMs: number): FiredRecord[] {
  const seen = new Set<string>();
  const out: FiredRecord[] = [];
  for (const r of [...journal, ...fired]) {
    const key = occurrenceKey(r);
    if (seen.has(key) || r.at < nowMs - JOURNAL_RETENTION_MS) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** The journal without the deliveries whose state is now saved. */
export function journalWithout(journal: FiredRecord[], acknowledged: readonly Pick<FiredRecord, 'id' | 'at'>[]): FiredRecord[] {
  const gone = new Set(acknowledged.map(occurrenceKey));
  return journal.filter((r) => !gone.has(occurrenceKey(r)));
}

/** Parse a stored journal or ledger; anything unreadable is an empty list. */
export function parseRecords<T extends FiredRecord>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
