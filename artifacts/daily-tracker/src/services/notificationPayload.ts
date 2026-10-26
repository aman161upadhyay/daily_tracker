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
import { isNudgePayload, type NudgePayload } from '@/src/state/commands';

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
  notification?: { date?: unknown; request?: { identifier?: unknown; content?: RawContent } };
};

/** `content.data` when present, else the parsed `dataString`; undefined when neither is usable. */
export function contentData(content: RawContent | undefined): unknown {
  if (!content) return undefined;
  if (content.data && typeof content.data === 'object') return content.data;
  if (typeof content.dataString === 'string') {
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
  const payload = contentData(r.notification?.request?.content);
  if (!isNudgePayload(payload)) return null;
  const action = r.actionIdentifier === DEFAULT_ACTION ? 'TAP' : r.actionIdentifier;
  const identifier = typeof r.notification?.request?.identifier === 'string' ? r.notification.request.identifier : payload.nudgeId;
  const date = typeof r.notification?.date === 'number' ? r.notification.date : '';
  return { payload, action, key: `${identifier}|${action}|${date}` };
}
