import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import type { NudgeActionKind } from '@/src/domain/nudges/planner';
import { currentZone } from '@/src/domain/time/clock';
import {
  NOTIFICATIONS_SUPPORTED,
  SupersededError,
  addResponseListener,
  cancelAll,
  consumeLaunchResponse,
  getPermission,
  beginHandling,
  endHandling,
  registerBackgroundReplan,
  type NudgeResponse,
} from '@/src/services/notifications';
import { registerResponseTask, replayPendingResponses } from '@/src/services/nudgeTasks';
import { contextFor, reconcileAndSync } from '@/src/services/replan';
import { nudgeResponseActions, type CommandContext } from '@/src/state/commands';
import { nudgePlan } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';

/** How long after a failed sync the schedule is tried again. */
const SYNC_RETRY_MS = 60_000;

/**
 * Keeps the OS notification schedule equal to the planner's output and turns
 * notification button presses into state changes. Renders nothing.
 */
export function NudgeScheduler() {
  const { state, ready, nowMs, zone, today, apply, replaceEpoch } = useTracker();
  const router = useRouter();
  const latest = useRef({ state, today, nowMs, zone });
  // Written after commit, not during render (a render-phase ref write makes the compiler skip
  // this component); every reader below is a listener or a timer, which runs after commit anyway.
  useLayoutEffect(() => {
    latest.current = { state, today, nowMs, zone };
  });

  // One instant, and the day derived from it. The rendered `today` is refreshed on a 30-second tick,
  // so a press right after the 3 am boundary (or a zone change) would otherwise be stamped with the
  // new instant under the previous day.
  const ctx = (state: typeof latest.current.state, at = Date.now()): CommandContext => contextFor(state, at, currentZone());

  const handle = async (r: NudgeResponse) => {
    if (!(await beginHandling(r))) return;
    // Decided against the newest state (a press right after a tap on Today, or two presses in the
    // same tick, see each other), at the instant the press arrived. The durable "handled" mark is
    // written only once the state write committed, so a crash in between replays the press rather
    // than losing it (replayed with the same instant, the command layer's dedupe makes it a no-op).
    // A save that gave up leaves it in the inbox for a later replay.
    let next = latest.current.state;
    let persisted = false;
    try {
      ({ next, persisted } = await apply((s) => nudgeResponseActions(s, r.payload, r.action as NudgeActionKind | 'TAP', ctx(s, r.receivedAt))));
    } finally {
      // Always closes the claim: a press whose application threw must not stay blocked in this
      // runtime (it is left in the inbox, one try spent, for a later replay).
      await endHandling(r.key, persisted).catch(() => undefined);
    }
    if (r.action === 'TAP') {
      // Land where the notification is about: the cycle tab for cycle reminders, the habit page
      // when the habit still exists, Today otherwise (a Sugar Shield walk without the habit added
      // carries a placeholder id; pushing it would show "This habit no longer exists").
      const id = r.payload.habitIds.find((h) => next.habits.some((x) => x.id === h && !x.archived));
      if (r.payload.kind === 'CYCLE') router.push(next.settings.cycleEnabled ? '/cycle' : '/');
      else if (r.payload.kind === 'SUMMARY' || r.payload.kind === 'EVENT' || !id) router.push('/');
      else router.push({ pathname: '/habit/[id]', params: { id } });
    }
  };

  // Listeners, headless task registration, the response that launched the app.
  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED || !ready) return;
    const remove = addResponseListener((r) => void handle(r).catch((err) => console.warn('Notification press failed', err)));
    void registerResponseTask();
    void registerBackgroundReplan();
    // Presses an earlier process wrote down and never confirmed applied, then the one that
    // launched the app (if any): the launch response is the newest, and the inbox dedupes both.
    void replayPendingResponses()
      .then(() => consumeLaunchResponse().then((r) => r && handle(r)))
      .catch((err) => console.warn('Notification press failed', err));
    return remove;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-plan whenever the plan changes (state or the minute), debounced. Also after the state was
  // replaced (erase, restore, sample data): the service's record went with the old state in the
  // same database transaction, so this sync starts from a clean slate — it cancels the old
  // state's alarms as not ours and schedules the new state's plan — even when the two plans
  // happen to read the same. And again a minute after a sync failed (the OS list could not be
  // read, the record could not be written): the schedule must not stay stale until the next
  // state change.
  const plan = ready ? nudgePlan(state, today, nowMs, zone) : null;
  const planKey = plan ? plan.map((n) => `${n.id}@${n.at}:${n.habitIds.join(',')}:${n.body}`).join('|') : '';
  const enabled = state.settings.remindersEnabled;
  const tapMl = state.settings.tapSizeMl;
  const units = state.settings.units;
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED || !ready) return;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let gone = false;
    const timer = setTimeout(async () => {
      try {
        if (!enabled) {
          await cancelAll();
          return;
        }
        if ((await getPermission()) !== 'granted') return;
        await reconcileAndSync(() => latest.current.state, apply, ctx(latest.current.state));
      } catch (err) {
        // A superseded sync (the record moved under it) is tried again as well, quietly.
        if (!(err instanceof SupersededError)) console.warn('Notification sync failed', err);
        if (!gone) retryTimer = setTimeout(() => setRetry((n) => n + 1), SYNC_RETRY_MS);
      }
    }, 600);
    return () => {
      gone = true;
      clearTimeout(timer);
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, planKey, enabled, tapMl, units, replaceEpoch, retry]);

  // Permission can change in system settings while we are away: re-sync on foreground.
  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !latest.current.state.settings.remindersEnabled) return;
      void (async () => {
        if ((await getPermission()) !== 'granted') return;
        await reconcileAndSync(() => latest.current.state, apply, ctx(latest.current.state));
      })().catch((err) => console.warn('Notification sync failed', err));
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
