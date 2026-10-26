/**
 * Health Connect bridge — web / iOS / Expo Go variant. Health Connect is an
 * Android system service that needs a native module, so here it is simply
 * unsupported and every call is a no-op. `healthConnect.native.ts` is the
 * real one; keep the exports identical.
 */
import type { BodyBatch, BodyRecordType } from '@/src/domain/body/types';

/**
 * - unsupported: not Android, or Expo Go (no native module)
 * - not-installed: Android without the Health Connect app (Android 13 and older)
 * - update-required: Health Connect is there but too old
 * - available: ready; permissions are a separate question
 */
export type HealthConnectStatus = 'unsupported' | 'not-installed' | 'update-required' | 'available';

export interface HealthAccess {
  granted: BodyRecordType[];
  /** Reads allowed while the app is in the background. */
  background: boolean;
}

export interface ReadWindow {
  /** Inclusive calendar days, local. */
  fromDay: string;
  toDay: string;
  zone: string;
  /** Tracking-day boundary hour (for workouts and drinks). */
  boundaryHour: number;
}

export interface ReadResult {
  batch: BodyBatch;
  /** Record types that failed to read, with the reason; the rest of the batch is still good. */
  errors: { type: BodyRecordType; message: string }[];
}

export const HEALTH_CONNECT_SUPPORTED: boolean = false;

export async function getStatus(): Promise<HealthConnectStatus> {
  return 'unsupported';
}

export async function requestAccess(): Promise<HealthAccess> {
  return { granted: [], background: false };
}

export async function currentAccess(): Promise<HealthAccess> {
  return { granted: [], background: false };
}

export async function readBatch(_window: ReadWindow, _granted: BodyRecordType[]): Promise<ReadResult> {
  return { batch: {}, errors: [] };
}

export async function openSettings(): Promise<void> {}

export async function openInstallPage(): Promise<void> {}
