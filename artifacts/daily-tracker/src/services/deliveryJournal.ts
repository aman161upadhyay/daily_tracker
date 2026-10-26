/**
 * What the notification service remembers between syncs, and how it reads the OS against it.
 *
 * The ledger lists what we handed to the OS. The sync learns about a delivery once: a ledger entry
 * whose alarm is no longer pending rang. If the fold of that report into the state is lost — the
 * save fails, Android kills the process — the slot is never written down: the planner re-offers
 * it (a second ring for a snooze the person already dismissed) and the daily cap is spent a slot
 * late. So every report also lands in a journal and is removed only once the caller says the
 * state that holds it is on disk. Until then each reconcile folds the journal again; the fold
 * dedupes by occurrence (slot id and time), so a replay changes nothing.
 *
 * The OS and our storage cannot be written as one. A sync therefore writes its intent — the ids
 * it is about to cancel, the entries it is about to schedule — before it touches the OS, and
 * clears it in the write that follows. A process death in between is read back on the next sync:
 * an entry we were cancelling that is gone did not ring; an entry we were scheduling that is
 * gone and overdue is taken to have rung, one that is gone and still ahead was never scheduled.
 * Without that, a cancelled alarm looks exactly like a delivered one (a ring the person never
 * saw, charged to the cap) and a scheduled alarm is unknown to the ledger (a ring that is never
 * written down, so the slot rings twice).
 *
 * Everything lives in one record under one key, so a read sees one consistent picture and a
 * write replaces it whole. Pure (no native imports) so the unit tests cover it.
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

/** The service's memory between syncs: read as one, written as one. */
export interface Bookkeeping {
  /** What we handed to the OS and believe is pending. */
  ledger: LedgerEntry[];
  /** Deliveries whose state is not confirmed saved yet. */
  journal: FiredRecord[];
  /** Ids the last sync was about to cancel when it wrote; cleared by its final write. */
  cancelling: string[];
  /** Entries the last sync was about to schedule when it wrote; cleared by its final write. */
  scheduling: LedgerEntry[];
}

export const EMPTY_BOOKKEEPING: Bookkeeping = { ledger: [], journal: [], cancelling: [], scheduling: [] };

export interface Resolved {
  /** What rang since the last sync (to be journaled and folded). */
  fired: FiredRecord[];
  /** Still pending past its time, within the grace: left alone, not counted. */
  overdueKept: LedgerEntry[];
  /** The ledger as it stands: entries the OS is known to hold. */
  live: LedgerEntry[];
}

/**
 * Read the OS against the bookkeeping: what rang, what is overdue yet pending, what is pending.
 *
 * An entry that is no longer pending rang, whatever the clock says now: the OS removes a one-shot
 * request only when it delivers it or when we cancel it — and a cancellation leaves its mark in
 * `cancelling` first. After the clock is set back, a delivered entry's time lies in the "future";
 * judging it by the time would hide that ring until the clock caught up and re-offer the slot.
 *
 * Without exact-alarm access (the Android 14+ default) an alarm may still be pending minutes
 * after its time. Such an entry has not fired: it is left scheduled for a while rather than
 * cancelled and counted against the daily cap as if the person had seen it.
 *
 * Intents left by a sync that died: an id in `cancelling` that is gone was cancelled, not
 * delivered. An entry in `scheduling` that is pending was scheduled and joins the ledger; one that
 * is gone and overdue is taken to have rung (the OS may well have delivered it — a ring that is
 * not written down comes back as a second one, worse than a phantom); one that is gone and still
 * ahead was never scheduled and is simply forgotten (the plan asks for it again). When the same id
 * was being replaced — cancelled and scheduled anew — and is pending, nobody can tell which of the
 * two the OS holds: it is left out of the ledger, so the sync cancels it and schedules it afresh.
 */
export function deliveries(bk: Pick<Bookkeeping, 'ledger' | 'cancelling' | 'scheduling'>, pending: ReadonlySet<string>, nowMs: number): Resolved {
  const cancelled = new Set(bk.cancelling);
  const intents = new Map(bk.scheduling.map((e) => [e.id, e]));
  const fired: FiredRecord[] = [];
  const live: LedgerEntry[] = [];
  const record = ({ sig: _sig, ...f }: LedgerEntry): FiredRecord => f;
  const seen = new Set<string>();
  for (const e of [...bk.ledger, ...bk.scheduling]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const old = bk.ledger.find((x) => x.id === e.id);
    const intent = intents.get(e.id);
    if (old && intent) {
      if (cancelled.has(e.id)) {
        // Replaced: the old one was being cancelled, the new one scheduled.
        if (pending.has(e.id)) continue; // which one is pending is unknowable: re-schedule
        if (intent.at <= nowMs) fired.push(record(intent));
      } else {
        // The old one had rung (and was journaled) when the new one was scheduled under the same id.
        fired.push(record(old));
        if (pending.has(e.id)) live.push(intent);
        else if (intent.at <= nowMs) fired.push(record(intent));
      }
      continue;
    }
    if (old) {
      if (pending.has(e.id)) live.push(old);
      else if (!cancelled.has(e.id)) fired.push(record(old));
      continue;
    }
    if (intent) {
      if (pending.has(e.id)) live.push(intent);
      else if (intent.at <= nowMs) fired.push(record(intent));
    }
  }
  const overdueKept = live.filter((e) => e.at <= nowMs && e.at > nowMs - OVERDUE_GRACE_MS);
  return { fired, overdueKept, live };
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

/** Parse the stored bookkeeping; a missing or unreadable record is empty (a key that could not be read at all is the caller's error). */
export function parseBookkeeping(raw: string | null): Bookkeeping {
  if (!raw) return { ...EMPTY_BOOKKEEPING };
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof Bookkeeping, unknown>> | null;
    const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    return {
      ledger: list<LedgerEntry>(p?.ledger),
      journal: list<FiredRecord>(p?.journal),
      cancelling: list<unknown>(p?.cancelling).filter((x): x is string => typeof x === 'string'),
      scheduling: list<LedgerEntry>(p?.scheduling),
    };
  } catch {
    return { ...EMPTY_BOOKKEEPING };
  }
}
