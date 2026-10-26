/**
 * Notification service — web build. The browser preview has no scheduled
 * notifications, so everything here is an honest no-op that reports
 * `unsupported`; the planner still runs and Settings shows the upcoming list.
 * Keep the exports identical to `notifications.native.ts`.
 */
import type { MindKind } from '@/src/domain/models';
import type { ScheduledNudge } from '@/src/domain/nudges/planner';
import type { NudgePayload } from '@/src/state/commands';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface FiredRecord {
  id: string;
  habitIds: string[];
  day: string;
  at: number;
}

export interface NudgeResponse {
  payload: NudgePayload;
  action: string;
  /** Unique per OS response, used to apply each press once. */
  key: string;
}

export const NOTIFICATIONS_SUPPORTED = false;
export const BACKGROUND_REPLAN_TASK = 'dailytracker-replan';
export const NUDGE_RESPONSE_TASK = 'dailytracker-nudge-response';

export async function getPermission(): Promise<PermissionState> {
  return 'unsupported';
}

export async function requestPermission(): Promise<PermissionState> {
  return 'unsupported';
}

export async function openNotificationSettings(): Promise<void> {}

export async function openExactAlarmSettings(): Promise<void> {}

export async function prepare(_tapMl: number): Promise<void> {}

/** Make the OS schedule match the plan. Returns nudges that fired since the last sync. */
export async function syncPlan(_plan: ScheduledNudge[], _nowMs: number): Promise<FiredRecord[]> {
  return [];
}

export async function cancelAll(): Promise<void> {}

export function addResponseListener(_onResponse: (r: NudgeResponse) => void): () => void {
  return () => {};
}

export async function consumeLaunchResponse(): Promise<NudgeResponse | null> {
  return null;
}

export async function scheduleMindEnd(_endAtMs: number, _minutes: number, _kind: MindKind): Promise<void> {}

export async function cancelMindEnd(): Promise<void> {}

export async function beginHandling(_key: string): Promise<boolean> {
  return true;
}

export async function endHandling(_key: string, _committed: boolean): Promise<void> {}

export async function registerBackgroundReplan(): Promise<'registered' | 'unavailable'> {
  return 'unavailable';
}
