import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BodyRecordType } from '@/src/domain/body/types';
import { describeSyncError, performBodySync } from '@/src/services/bodySync';
import { HEALTH_CONNECT_SUPPORTED, getStatus, openInstallPage, openSettings, requestAccess, type HealthConnectStatus } from '@/src/services/healthConnect';
import { contextFor } from '@/src/services/replan';
import { useTracker } from '@/src/state/TrackerProvider';

export interface HealthConnectUi {
  supported: boolean;
  status: HealthConnectStatus | 'checking';
  /** Switched on by the user and still holding at least one read permission. */
  connected: boolean;
  enabled: boolean;
  granted: BodyRecordType[];
  background: boolean;
  busy: boolean;
  lastSyncAt?: number;
  lastError?: string;
  /** Ask for permissions, remember the choice and read the first 30 days. */
  connect(): Promise<void>;
  syncNow(): Promise<void>;
  /** Stop importing; everything already imported stays. */
  disconnect(): void;
  /** Stop importing and forget every imported number (and the entries they created). */
  removeImported(): void;
  openSettings(): Promise<void>;
  openInstallPage(): Promise<void>;
  refreshStatus(): Promise<void>;
}

/** One sync at a time per process, shared by every caller of the hook. */
let inflight: Promise<void> | null = null;
let lastAttemptAt = 0;

/** Foreground syncs closer together than this are skipped (a manual "Sync now" ignores it). */
export const AUTO_SYNC_GAP_MS = 2 * 60_000;

export function useHealthConnect(): HealthConnectUi {
  const { state, dispatch, actions, zone } = useTracker();
  const [status, setStatus] = useState<HealthConnectStatus | 'checking'>(HEALTH_CONNECT_SUPPORTED ? 'checking' : 'unsupported');
  const [busy, setBusy] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  // Bumped by Disconnect / Remove imported data: a read that was in flight when the user turned
  // the import off must not land its rows (or its auto-ticks) afterwards.
  const generation = useRef(0);

  const refreshStatus = useCallback(async () => {
    if (!HEALTH_CONNECT_SUPPORTED) return;
    try {
      setStatus(await getStatus());
    } catch (err) {
      console.warn('Health Connect status failed', err);
      setStatus('not-installed');
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const runSync = useCallback(async () => {
    if (!HEALTH_CONNECT_SUPPORTED) return;
    if (inflight) return inflight;
    lastAttemptAt = Date.now();
    setBusy(true);
    const started = generation.current;
    const stillWanted = () => started === generation.current && latest.current.settings.healthConnectEnabled;
    inflight = (async () => {
      try {
        const ctx = contextFor(latest.current, Date.now(), zone);
        const { actions: out } = await performBodySync(() => latest.current, ctx);
        if (!stillWanted()) return;
        for (const a of out) dispatch(a);
      } catch (err) {
        console.warn('Health Connect sync failed', err);
        if (stillWanted()) dispatch({ type: 'BODY_SYNC', patch: { lastError: describeSyncError(err) } });
      }
    })();
    try {
      await inflight;
    } finally {
      inflight = null;
      setBusy(false);
    }
  }, [dispatch, zone]);

  const connect = useCallback(async () => {
    if (!HEALTH_CONNECT_SUPPORTED) return;
    setBusy(true);
    try {
      const access = await requestAccess();
      if (access.granted.length === 0) {
        dispatch({ type: 'BODY_SYNC', patch: { granted: [], background: false, lastError: 'No permissions were granted. Allow at least one data type in Health Connect to import it.' } });
        return;
      }
      dispatch({ type: 'BODY_SYNC', patch: { granted: access.granted, background: access.background, lastError: undefined } });
      actions.updateSettings({ healthConnectEnabled: true });
    } catch (err) {
      console.warn('Health Connect permission request failed', err);
      dispatch({ type: 'BODY_SYNC', patch: { lastError: describeSyncError(err) } });
      return;
    } finally {
      setBusy(false);
    }
    await runSync();
  }, [actions, dispatch, runSync]);

  const disconnect = useCallback(() => {
    generation.current += 1;
    actions.updateSettings({ healthConnectEnabled: false });
  }, [actions]);

  const removeImported = useCallback(() => {
    generation.current += 1;
    dispatch({ type: 'CLEAR_BODY' });
    actions.updateSettings({ healthConnectEnabled: false });
  }, [actions, dispatch]);

  const sync = state.body.sync;
  const enabled = state.settings.healthConnectEnabled;
  return useMemo<HealthConnectUi>(
    () => ({
      supported: HEALTH_CONNECT_SUPPORTED,
      status,
      enabled,
      connected: enabled && sync.granted.length > 0,
      granted: sync.granted,
      background: sync.background,
      busy,
      lastSyncAt: sync.lastSyncAt,
      lastError: sync.lastError,
      connect,
      syncNow: runSync,
      disconnect,
      removeImported,
      openSettings,
      openInstallPage,
      refreshStatus,
    }),
    [status, enabled, sync, busy, connect, runSync, disconnect, removeImported, refreshStatus],
  );
}

/** Whether an automatic (foreground) sync is due. */
export function autoSyncDue(nowMs = Date.now()): boolean {
  return nowMs - lastAttemptAt >= AUTO_SYNC_GAP_MS;
}
