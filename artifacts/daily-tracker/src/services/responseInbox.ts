/**
 * The inbox of notification button presses, and the marks of the ones already applied.
 *
 * Android hands a press to our background task once; expo-task-manager keeps nothing durable, so
 * a process death between the press reaching JavaScript and the state write landing loses it (a
 * drink logged from the notification that never arrives, a "Done" that rings again). The handler
 * therefore writes the press down before doing anything else, applies it, and only then marks it
 * handled and drops it from the inbox. Whatever is still in the inbox at the next start (of the
 * app, or of any headless task) is applied then — with the instant it was received, so a replay
 * computes exactly what the first attempt did, and the command layer's own dedupe (the nudge
 * events written in the same transaction as the log) makes a second application a no-op.
 *
 * The record lives beside the state (see TrackerStore.readRecord): it is as durable as the state
 * and is replaced with it. Pure (no native imports) so the unit tests cover it.
 */
import { parsePayload, type NudgePayload } from '@/src/state/commands';

export interface StoredResponse {
  /** One press: notification id, action and delivery time (see notificationPayload). */
  key: string;
  payload: NudgePayload;
  action: string;
  /** When the press reached us; the instant every application of it is computed with. */
  receivedAt: number;
  /** Applications that did not reach the database. */
  tries: number;
}

export interface Responses {
  /** Press key → when it was applied. */
  handled: Record<string, number>;
  /** Presses received and not yet confirmed applied, oldest first. */
  inbox: StoredResponse[];
}

export const EMPTY_RESPONSES: Responses = { handled: {}, inbox: [] };

/** A press that failed this often is dropped: something about it is wrong, not the moment. */
export const MAX_TRIES = 5;
/** A press older than this is not replayed: its notification, its day and its slot are gone. */
export const INBOX_RETENTION_MS = 48 * 3_600_000;
/** Handled marks are kept this long (the OS never re-delivers a press older than that). */
export const HANDLED_RETENTION_MS = 3 * 24 * 3_600_000;
const MAX_HANDLED = 200;
const MAX_INBOX = 50;
const MAX_KEY_LENGTH = 300;

const isKey = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_KEY_LENGTH;
const isInstant = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e14;

function storedResponse(x: unknown): StoredResponse | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const payload = parsePayload(r.payload);
  if (!payload || !isKey(r.key) || typeof r.action !== 'string' || r.action.length === 0 || r.action.length > 40 || !isInstant(r.receivedAt)) return null;
  const tries = typeof r.tries === 'number' && Number.isInteger(r.tries) && r.tries >= 0 ? r.tries : 0;
  return { key: r.key, payload, action: r.action, receivedAt: r.receivedAt, tries };
}

/** Parse the stored record; unreadable parts are dropped, never fatal. */
export function parseResponses(raw: string | null): Responses {
  if (!raw) return { handled: {}, inbox: [] };
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof Responses, unknown>> | null;
    const handled: Record<string, number> = {};
    if (p?.handled && typeof p.handled === 'object' && !Array.isArray(p.handled)) {
      for (const [k, v] of Object.entries(p.handled as Record<string, unknown>)) if (isKey(k) && isInstant(v)) handled[k] = v;
    }
    const inbox: StoredResponse[] = [];
    if (Array.isArray(p?.inbox)) {
      for (const x of p.inbox) {
        const r = storedResponse(x);
        if (r && !inbox.some((o) => o.key === r.key)) inbox.push(r);
      }
    }
    return prune({ handled, inbox: inbox.sort((a, b) => a.receivedAt - b.receivedAt) }, Number.NEGATIVE_INFINITY);
  } catch {
    return { handled: {}, inbox: [] };
  }
}

/** Bounded: old marks and stale presses go, and never more than the caps. */
function prune(r: Responses, nowMs: number): Responses {
  const marks = Object.entries(r.handled)
    .filter(([, at]) => at > nowMs - HANDLED_RETENTION_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_HANDLED);
  const inbox = r.inbox.filter((x) => x.receivedAt > nowMs - INBOX_RETENTION_MS && x.tries < MAX_TRIES).slice(-MAX_INBOX);
  return { handled: Object.fromEntries(marks), inbox };
}

/** Whether this press was applied already. */
export function wasHandled(r: Responses, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(r.handled, key);
}

/** The record with a press written down (once; a press already in the inbox or handled is left as is). */
export function withReceived(r: Responses, press: Omit<StoredResponse, 'tries'>, nowMs: number): Responses {
  if (wasHandled(r, press.key) || r.inbox.some((x) => x.key === press.key)) return r;
  return prune({ handled: r.handled, inbox: [...r.inbox, { ...press, tries: 0 }] }, nowMs);
}

/** The record once a press reached the database: marked for good, out of the inbox. */
export function withHandled(r: Responses, key: string, nowMs: number): Responses {
  return prune({ handled: { ...r.handled, [key]: nowMs }, inbox: r.inbox.filter((x) => x.key !== key) }, nowMs);
}

/** The record after an application that did not reach the database: the press stays, one try spent. */
export function withFailed(r: Responses, key: string, nowMs: number): Responses {
  return prune({ handled: r.handled, inbox: r.inbox.map((x) => (x.key === key ? { ...x, tries: x.tries + 1 } : x)) }, nowMs);
}

/** The presses still to apply, oldest first. */
export function pending(r: Responses, nowMs: number): StoredResponse[] {
  return prune(r, nowMs).inbox;
}
