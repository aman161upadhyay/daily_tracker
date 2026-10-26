/**
 * Reading a notification response the way Android actually delivers it.
 *
 * The foreground listener gets a response that expo-notifications has already
 * mapped (`content.data` is an object). A background task gets the raw bundle:
 * on Android the data of a scheduled notification travels as `content.dataString`,
 * a JSON string, and `content.data` is absent. Both shapes are accepted here so
 * a button pressed while the app is closed is not silently ignored.
 * Pure (no native imports) so it is covered by the unit tests.
 */
import { parsePayload, type NudgePayload } from '@/src/state/commands';

export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export interface ParsedResponse {
  payload: NudgePayload;
  /** Button identifier, or 'TAP' for a tap on the notification body. */
  action: string;
  /** Dedupe key: one per delivered notification and button. */
  key: string;
}

type RawContent = { data?: unknown; dataString?: unknown };
type RawResponse = {
  actionIdentifier?: unknown;
  notification?: { date?: unknown; request?: { identifier?: unknown; content?: RawContent; trigger?: unknown } };
};

/**
 * Only responses to notifications this app scheduled are acted on. Everything we schedule uses a
 * date trigger, so that is what the OS hands back. A response whose trigger says "push" never came
 * from us: this app has no push setup, but expo-notifications treats any launch intent carrying a
 * `google.message_id` extra as a push response and builds one from the intent's own `body` — which
 * another app on the phone can craft to log a "session" or a drink through MainActivity. A missing
 * trigger is tolerated (older serialisations), an explicit non-date one is not.
 */
export function isOwnTrigger(trigger: unknown): boolean {
  if (trigger === undefined || trigger === null) return true;
  if (typeof trigger !== 'object') return false;
  return (trigger as { type?: unknown }).type === 'date';
}

/** `content.data` when present, else the parsed `dataString`; undefined when neither is usable. */
export function contentData(content: RawContent | undefined): unknown {
  if (!content) return undefined;
  if (content.data && typeof content.data === 'object') return content.data;
  // A sane size for our own payloads; anything larger is not ours.
  if (typeof content.dataString === 'string' && content.dataString.length <= 8_192) {
    try {
      return JSON.parse(content.dataString) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function parseResponse(raw: unknown): ParsedResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawResponse;
  if (typeof r.actionIdentifier !== 'string') return null;
  if (!isOwnTrigger(r.notification?.request?.trigger)) return null;
  // Validated field by field (the bundle is the OS's copy of what we scheduled, parsed from JSON).
  const payload = parsePayload(contentData(r.notification?.request?.content));
  if (!payload) return null;
  const action = r.actionIdentifier === DEFAULT_ACTION ? 'TAP' : r.actionIdentifier;
  const identifier = typeof r.notification?.request?.identifier === 'string' ? r.notification.request.identifier : payload.nudgeId;
  const date = typeof r.notification?.date === 'number' ? r.notification.date : '';
  return { payload, action, key: `${identifier}|${action}|${date}` };
}
